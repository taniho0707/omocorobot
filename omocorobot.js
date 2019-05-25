'use strict';

const fs = require("fs");
const config = require("config");
const log4js = require("log4js");
const Discord = require("discord.js");
const request = require('sync-request');
const sqlite3 = require('sqlite3').verbose();

const client = new Discord.Client();

const helpmessage = "\
【ライトノベルBOXの使い方】\n\
/help : このヘルプを表示します\n\
/shuffle : ランダムに4つの言葉を表示します\n\
/add word : 新しい言葉を1つ追加します\n\
/remove word : 既に存在する言葉を1つ削除します\n\
/award : 人気タイトルを表示します\n\
/status : 最終バックアップ日時を表示します\n\
\n\
元ネタ : 【ラノベ】売れるライトノベルのタイトルを単語シャッフルで作ってみた | オモコロ http://omocoro.jp/kiji/108660/";

log4js.configure(config.log4js);
const defaultLogger = log4js.getLogger('default');
const debugLogger = log4js.getLogger('debug');
const errorLogger = log4js.getLogger('error');
process.on('unhandledRejection', errorLogger.error);
defaultLogger.info('run omocorobot');


// Databases
var dbWord;
var dbTitle;


// Load Configs and Token
let token = '';
let channelid = '';
const secret = JSON.parse(fs.readFileSync(config.secretPath));
if (fs.existsSync(config.secretPath)) {
    token = secret.token;
    channelid = secret.channelid;
} else {
    errorLogger.error('Not found secret file');
    process.exit(1);
}



function openOrCreateDatabase () {
    dbWord = new sqlite3.Database('word.sqlite');
    dbTitle = new sqlite3.Database('title.sqlite');

    dbWord.serialize(() => {
        dbWord.run('CREATE TABLE IF NOT EXISTS word (name TEXT PRIMARY KEY, rawname TEXT, enabled BOOLEAN)');
    });
    dbTitle.serialize(() => {
        dbTitle.run('CREATE TABLE IF NOT EXISTS title (messageid INT PRIMARY KEY, title TEXT, author TEXT, word1 TEXT, word2 TEXT, word3 TEXT, word4 TEXT, reaction INT)');
    });

    defaultLogger.info("Open databases");
}

function closeDatabase () {
    dbWord.close();
    dbTitle.close();
    defaultLogger.info("Close databases");
}


// shuffleコマンドに対応する結果を返す
function getRandomWord (callback) {
    dbWord.all("SELECT * FROM word ORDER BY RANDOM() LIMIT 4", [], (err, rows) => {
        if (err) {
            errorLogger.error(err);
        } else {
            let randomwords = "【ライトノベルBOX】";
            for (var i of rows) {
                randomwords += "\n";
                randomwords += i.rawname;
            }
            defaultLogger.info(randomwords);
            callback(randomwords);
        }
    });
}

// 有効化された単語数を返す
function getStatus (callback) {
    dbWord.get("SELECT COUNT(name) FROM word WHERE enabled = 1", [], (err, row) => {
        if (err) {
            errorLogger.error(err);
        } else {
            let status = "【omocorobot status】";
            status += "\n単語総数：";
            status += row['COUNT(name)'];
            status += "語";

            var backupstatus = fs.readFileSync(secret.backuplog);
            status += "\n最終バックアップ日時：";
            status += backupstatus;

            defaultLogger.info(status);
            callback(status);
        }
    });
}


// 人気タイトルを返す
function getAwardTitles () {

}


// 単語を正規化する
function normalizeWord (str) {
    return str.replace(/[Ａ-Ｚａ-ｚ０-９]/g, function(s) {
        return String.fromCharCode(s.charCodeAt(0) - 65248);
    }).toUpperCase();
}


var existWord = function (str) {
    return new Promise(resolve => {
        var existItem;
        var exist = true;
        var enabled = false;
        var ret;
        dbWord.get("SELECT * FROM word WHERE name = ?", [normalizeWord(str)], (err,row) => {
            existItem = row;
            
            if (existItem === undefined) {
                exist = false;
                ret = {
                    "exist": exist,
                    "str": str,
                    "enabled": false
                };
            } else {
                if (existItem.enabled === 1) {
                    enabled = true
                }
                ret = {
                    "exist": exist,
                    "str": str,
                    "enabled": existItem.enabled
                };
            }
            resolve(ret);
        });
    });
}


// 単語を1個追加/有効化する
var addWord = function (item) {
    return new Promise(resolve => {
        var exist = item.exist;
        if (item.enabled === false) {
            exist = false;
        }
        if (exist === false) {
            dbWord.run("INSERT OR REPLACE INTO word VALUES (?,?,?)", [normalizeWord(item.str), item.str, true], () => {
                resolve(item);
            });
        } else {
            resolve(item);
        }
    });
}

// 複数の単語をデータベースに追加/有効化します
async function addWords (str, callback) {
    var doquery = async function (key) {
        return new Promise(resolve => {
            existWord(key).then(addWord).then(item => {
                resolve(item);
            });
        });
    }
    
    var keys = str.replace(/^\s*/, '');
    keys = keys.split(/[,， 　]/);
    await Promise.all(
        keys.map((item) => {
            return doquery(item);
        })
    ).then((res) => {
        var message = "";
        var existCount = 0;
        var existArray = [];
        var noexistCount = 0;
        var noexistArray = [];
        for (var item of res) {
            if (item.exist && item.enabled) {
                ++ existCount;
                existArray.push(item.str);
            } else {
                ++ noexistCount;
                noexistArray.push(item.str);
            }
        }
        if (noexistCount !== 0) {
            message += "🆗 新しく ";
            for (var i of noexistArray) {
                message += "\"" + i + "\" ";
            }
            message += "を登録しました\n";
        }
        if (existCount !== 0) {
            message += "⛔ ";
            for (var i of existArray) {
                message += "\"" + i + "\" ";
            }
            message += "は既に登録されています\n";
        }
        callback(message);
    });
}


// 単語を1個削除/無効化する
var removeWord = function (item) {
    return new Promise(resolve => {
        var exist = item.exist;
        if (item.enabled === false) {
            exist = false;
        }
        if (exist === true) {
            dbWord.run("UPDATE word SET enabled = 0 WHERE name = ?", [normalizeWord(item.str)], () => {
                resolve(item);
            });
        } else {
            resolve(item);
        }
    });
}

// 複数の単語をデータベースから削除/無効化します
async function removeWords (str, callback) {
    var doquery = async function (key) {
        return new Promise(resolve => {
            existWord(key).then(removeWord).then(item => {
                resolve(item);
            });
        });
    }
    
    var keys = str.replace(/^\s*/, '');
    keys = keys.split(/[,， 　]/);
    await Promise.all(
        keys.map((item) => {
            return doquery(item);
        })
    ).then((res) => {
        var message = "";
        var existCount = 0;
        var existArray = [];
        var noexistCount = 0;
        var noexistArray = [];
        for (var item of res) {
            if (item.exist && item.enabled) {
                ++ existCount;
                existArray.push(item.str);
            } else {
                ++ noexistCount;
                noexistArray.push(item.str);
            }
        }
        if (existCount !== 0) {
            message += "🆗 ";
            for (var i of existArray) {
                message += "\"" + i + "\" ";
            }
            message += " を削除しました\n";
        }
        if (noexistCount !== 0) {
            message += "⛔ ";
            for (var i of noexistArray) {
                message += "\"" + i + "\" ";
            }
            message += " は登録されていません\n";
        }
        callback(message);
    });
}


// 複数の単語があるか確認する
async function existWords (str, callback) {
    var doquery = async function (key) {
        return new Promise(resolve => {
            existWord(key).then(item => {
                resolve(item);
            });
        });
    }
    
    var keys = str.replace(/^\s*/, '');
    keys = keys.split(/[,， 　]/);
    await Promise.all(
        keys.map((item) => {
            return doquery(item);
        })
    ).then((res) => {
        var message = "";
        var existCount = 0;
        var existArray = [];
        var disabledCount = 0;
        var disabledArray = [];
        var noexistCount = 0;
        var noexistArray = [];
        for (var item of res) {
            if (item.exist && item.enabled) {
                ++ existCount;
                existArray.push(item.str);
            } else if (item.exist) {
                ++ disabledCount;
                disabledArray.push(item.str);
            } else {
                ++ noexistCount;
                noexistArray.push(item.str);
            }
        }
        if (existCount !== 0) {
            message += "⭕ ";
            for (var i of existArray) {
                message += "\"" + i + "\" ";
            }
            message += " は登録されています\n";
        }
        if (noexistCount !== 0) {
            message += "❌ ";
            for (var i of noexistArray) {
                message += "\"" + i + "\" ";
            }
            message += " は登録されていません\n";
        }
        if (disabledCount !== 0) {
            message += "❓ ";
            for (var i of disabledArray) {
                message += "\"" + i + "\" ";
            }
            message += " は以前登録されていました\n";
        }
        callback(message);
    });
}


client.on('ready', () => {
    defaultLogger.info('omocorobot started');
});

client.on('message', message => {
    if (message.content === "/help") {
        message.channel.send(helpmessage);
    } else if (message.content === "/shuffle") {
        getRandomWord((msg) => {
            message.channel.send(msg);
        });
    } else if (message.content === "/status") {
        getStatus((msg) => {
            message.channel.send(msg);
        });
    } else if (message.content === "/award") {
        // let awardtitles = "【優秀タイトル】";
        // awardtitles += getAwardTitles();
        // message.channel.send(awardtitles);
    } else if (message.content.indexOf('/add') === 0) {
        let words = message.content.replace(/\/add/, '');
        if (!(words)) {
            message.channel.send("🙅 有効な文字列を入力してください\n /add word");
        } else {
            addWords(words, (msg) => {
                message.channel.send(msg);
                // defaultLogger(msg);
            });
        }
    } else if (message.content.indexOf('/remove') === 0) {
        let words = message.content.replace(/\/remove/, '');
        if (!(words)) {
            message.channel.send("🙅 有効な文字列を入力してください\n /remove word");
        } else {
            removeWords(words, (msg) => {
                message.channel.send(msg);
                // defaultLogger(msg);
            });
        }
    } else if (message.content.indexOf('/exist') === 0) {
        let words = message.content.replace(/\/exist/, '');
        if (!(words)) {
            message.channel.send("🙅 有効な文字列を入力してください\n \exist word");
        } else {
            existWords(words, (msg) => {
                message.channel.send(msg);
            });
        }
    }
});


// 終了前処理
process.on('exit', function (code) {
    closeDatabase();
    defaultLogger.info('exit program');
    defaultLogger.info('return code: ' + code);
});
process.on('SIGINT', function() {
    process.exit();
});



openOrCreateDatabase();

client.login(token);


