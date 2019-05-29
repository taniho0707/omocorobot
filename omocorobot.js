'use strict';

const fs = require("fs");
const config = require("config");
const log4js = require("log4js");
const Discord = require("discord.js");
const request = require('sync-request');
const sqlite3 = require('sqlite3').verbose();
const {promisify} = require('util');

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


// Status
var messageLogStatus;
var fetchingMessages;

// ステータスをファイルに保存する
function saveStatus() {
    fs.writeFileSync('./status.json', JSON.stringify(messageLogStatus, null, '    '));
}

// ステータスをファイルから読み出す
function loadStatus() {
    messageLogStatus = JSON.parse(fs.readFileSync('./status.json', 'utf8'));
}

// メッセージをさかのぼり読込する
function fetchAndAppend(channel, id, lastid, callback) {
    channel.fetchMessages({limit:50, after:id})
        .then((messages) => {
            var nextid = messages.array()[0].id;
            fetchingMessages = messages.array().concat(fetchingMessages);
            defaultLogger.info("Received " + messages.size + " messages");
            if (messages.size === 50 && nextid !== lastid) {
                fetchAndAppend(channel, nextid, lastid, callback);
            } else {
                defaultLogger.info("Fetch done!");
                callback();
            }
        })
        .catch(errorLogger.error);
}

function fetch(callback) {
    const titlechannel = client.channels.find('id', secret.channelid);
    const lastmessageid = messageLogStatus.lastMessageId;
    defaultLogger.info("Load start from lastmessage id: " + lastmessageid);
    if (lastmessageid === titlechannel.lastMessageID) {
        defaultLogger.info("This is the latest message");
    } else {
        messageLogStatus.lastMessageId = titlechannel.lastMessageID;
        fetchAndAppend(titlechannel, lastmessageid, titlechannel.lastMessageID, callback);
    }
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
    dbWord.all("SELECT * FROM word WHERE enabled = 1 ORDER BY RANDOM() LIMIT 4", [], (err, rows) => {
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

// titleコマンドに対応し，ランダムなタイトルを返す
var getRandomTitle = function (filter) {
    return new Promise(resolve => {
        if (filter == null) {
            dbTitle.get("SELECT * FROM title ORDER BY RANDOM() LIMIT 1", [], (err, row) => {
                if (err) {
                    errorLogger.error(err);
                } else {
                    resolve(row);
                }
            });
        } else {
            dbTitle.get("SELECT * FROM title WHERE word1 = ? OR word2 = ? OR word3 = ? OR word4 = ? OR author = ? ORDER BY RANDOM() LIMIT 1", [normalizeWord(filter), normalizeWord(filter), normalizeWord(filter), normalizeWord(filter), filter], (err, row) => {
                if (err) {
                    errorLogger.error(err);
                } else {
                    resolve(row);
                }
            });
        }
    });
}

async function getPreviousMessage (id) {
    await message.channel.fetchMessage(id).then(oldmsg => {
        var status = "【過去タイトル】\n";
        status += msg["title"];
        status += "\n投稿：";
        status += msg["author"];
        status += "，";
        var date = new Date(oldmsg.createdTimestamp);
        status += date.toString();
        callback(status);
    });
}


// 有効化された単語数を返す
function getStatus (callback) {
    dbWord.get("SELECT COUNT(name) FROM word WHERE enabled = 1", [], (err, row) => {
        if (err) {
            errorLogger.error(err);
        } else {
            dbTitle.get("SELECT COUNT(messageid) FROM title", [], (err, titlerow) => {
                if (err) {
                    errorLogger.error(err);
                } else {
                    let status = "【omocorobot status】";
                    status += "\n単語総数：";
                    status += row['COUNT(name)'];
                    status += "語";

                    status += "\nタイトル総数：";
                    status += titlerow['COUNT(messageid)'];
                    status += "タイトル";

                    var backupstatus = fs.readFileSync(secret.backuplog);
                    status += "\n最終バックアップ日時：";
                    status += backupstatus;

                    defaultLogger.info(status);
                    callback(status);
                }
            });
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
                    "enabled": enabled
                };
            }
            resolve(ret);
        });
    });
}


// 単語を1個追加/有効化する
var addWord = function (item) {
    return new Promise(resolve => {
        if (item.exist === false || item.enabled === false) {
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
        if (item.exist === true || item.enabled === true) {
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




// タイトルらしき投稿を判別します
function judgeTitleInOneTheme (str, words) {
    var counter = 0;
    var returnObject = {
        "result": false,
        "words": [],
        "count": 0
    };
    var normalizedStr = normalizeWord(str);
    for (var i=0; i<4; ++i) {
        if (normalizedStr.indexOf(words[i]) !== -1) {
            ++ counter;
            returnObject.words.push(words[i]);
        }
    }
    if (counter >= 3) {
        returnObject.result = true;
        returnObject.count = 4;
        if (counter === 3) {
            returnObject.words.push("");
            returnObject.count = 3;
        }
    }
    return returnObject;
}

function judgeTitle (msg) {
    if (msg.content.indexOf('【過去タイトル】') === 0) {
        return 0;
    }
    
    var returnObject;
    if (messageLogStatus.themeWords1[0] !== "") {
        returnObject = judgeTitleInOneTheme(msg.content, messageLogStatus.themeWords1);
        if (returnObject.result) {
            addTitle(msg.content, returnObject.words, msg.id, msg.author.username);
            return returnObject.count;
        }
    }
    if (messageLogStatus.themeWords2[0] !== "") {
        returnObject = judgeTitleInOneTheme(msg.content, messageLogStatus.themeWords2);
        if (returnObject.result) {
            addTitle(msg.content, returnObject.words, msg.id, msg.author.username);
            return returnObject.count;
        }
    }
    if (messageLogStatus.themeWords3[0] !== "") {
        returnObject = judgeTitleInOneTheme(msg.content, messageLogStatus.themeWords3);
        if (returnObject.result) {
            addTitle(msg.content, returnObject.words, msg.id, msg.author.username);
            return returnObject.count;
        }
    }
    return 0;
}


// ライトノベルBOXを回した投稿かどうか判別し，必要であれば更新します
function isShuffleResult (str) {
    if (str.indexOf('【ライトノベルBOX】') === 0) {
        var words = str.split("\n");
        for (var i = 0; i < 4; ++i) {
            messageLogStatus.themeWords3[i] = messageLogStatus.themeWords2[i];
        }
        for (var i = 0; i < 4; ++i) {
            messageLogStatus.themeWords2[i] = messageLogStatus.themeWords1[i];
        }
        messageLogStatus.themeWords1[0] = normalizeWord(words[1]);
        messageLogStatus.themeWords1[1] = normalizeWord(words[2]);
        messageLogStatus.themeWords1[2] = normalizeWord(words[3]);
        messageLogStatus.themeWords1[3] = normalizeWord(words[4]);
        return true;
    } else {
        return false;
    }
}


// タイトルを登録します
function addTitle (str, words, id, author) {
    var word3 = null;
    if (words[3] !== "") {
        word3 = words[3];
    }
    dbTitle.run("INSERT INTO title VALUES (?,?,?,?,?,?,?,?)", [
        id, str, author, words[0], words[1], words[2], word3, 0
    ], (err) => {
        if (err) {
            errorLogger.error(err);
        }
        defaultLogger.info("Add title \"" + str + "\" (" + author + ")");
    });
}



client.on('ready', () => {
    defaultLogger.info('omocorobot started');
    fetch(() => {
        dbTitle.serialize(() => {
            for (var i=fetchingMessages.length-2; i>=0; --i) {
                if (isShuffleResult(fetchingMessages[i].content)) {
                    saveStatus();
                } else {
                    if (judgeTitle(fetchingMessages[i])) {
                        defaultLogger.info("Add title " + fetchingMessages[i].content);
                        // fetchingMessages.react('❤');
                    }
                }
            }
        });
        saveStatus();
    });
});

client.on('message', message => {
    if (message.content === "/help") {
        message.channel.send(helpmessage);
    } else if (message.content === "/shuffle" || message.content === "/s") {
        getRandomWord((msg) => {
            message.channel.send(msg);
        });
    } else if (message.content === "/status") {
        getStatus((msg) => {
            message.channel.send(msg);
        });
    } else if (message.content.indexOf('/title') === 0) {
        if (message.content === "/title") {
            // ここ以下，Promiseチェーンで繋げてみる(エラーハンドリングもする)
            getRandomTitle(null).then((msg) => {
                if (msg == undefined) {
                    var status = "タイトルは見つかりませんでした";
                    message.channel.send(status);
                } else {
                    // message.channel.fetchMessage(msg["messageid"]).then(oldmsg => {
                        //     var status = "【過去タイトル】\n";
                        //     status += msg["title"];
                        //     status += "\n投稿：";
                        //     status += msg["author"];
                        //     status += "，";
                        //     var date = new Date(oldmsg.createdTimestamp);
                        //     status += date.toString();
                        //     message.channel.send(status);
                    // });
                    return Promise.resolve()
                        .then(promisify(message.channel.fetchMessage)(msg["messageid"]))
                        .then((status) => {
                            message.channel.send(status)
                        });
                }
            });
        } else {
            getRandomTitle(message.content.replace(/\/title /, ''), (msg) => {
                message.channel.send(msg);
            });
        }
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
    } else {
        if (isShuffleResult(message.content)) {
            
        } else {
            let judgedcount = judgeTitle(message);
            if (judgedcount >= 3) {
                message.react('❤');
            }
            if (judgedcount === 4) {
                message.react('💮');
            }
        }
    }
    messageLogStatus.lastMessageId = message.id;
    saveStatus();
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


loadStatus();
openOrCreateDatabase();

client.login(token);


