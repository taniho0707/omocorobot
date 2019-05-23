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
if (fs.existsSync(config.secretPath)) {
    const secret = JSON.parse(fs.readFileSync(config.secretPath));
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
}

function closeDatabase () {
    dbWord.close();
    dbTitle.close();
}


// shuffleコマンドに対応する結果を返す
function getRandomWord () {

}

// 人気タイトルを返す
function getAwardTitles () {

}


// 複数の単語を分離する
function splitWords (str) {

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
        dbWord.get("SELECT * FROM word WHERE name = ?", [normalizeWord(str)], (err,row) => {
            existItem = row;
            if (existItem === undefined || existItem.enabled === 0) {
                exist = false;
            }
            var ret = {
                "exist": exist,
                "str": str
            };
            resolve(ret);
        });
    });
}

// 単語を1個追加/有効化する
var addWord = function (item) {
    return new Promise(resolve => {
        var exist = item.exist;
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
async function addWords (str) {
    var doquery = async function (key) {
        return new Promise(resolve => {
            existWord(key).then(addWord).then(item => {
                console.log(item);
                resolve(item);
            });
        });
    }
    
    var keys = str.split(/[,， 　]/);
    await Promise.all(
        keys.map((item) => {
            return doquery(item);
        })
    ).then((res) => {
        console.log(res);
        var message = "";
        var existCount = 0;
        var existArray = [];
        var noexistCount = 0;
        var noexistArray = [];
        for (var item of res) {
            if (item.exist) {
                ++ existCount;
                existArray.push(item.str);
            } else {
                ++ noexistCount;
                noexistArray.push(item.str);
            }
        }
        if (noexistCount !== 0) {
            message += "新しく ";
            for (var i of noexistArray) {
                message += "\"" + i + "\" ";
            }
            message += "を登録しました\n";
        }
        if (existCount !== 0) {
            for (var i of existArray) {
                message += "\"" + i + "\" ";
            }
            message += "は既に登録されています\n";
        }
        console.log(message);
    });
}


// 単語を1個削除/無効化する
function removeWord (str) {

}

// 複数の単語をデータベースから削除/無効化します
function removeWords (str) {

}


client.on('ready', () => {
    defaultLogger.info('omocorobot started');
});

client.on('message', message => {
    if (message.content === "/help") {
        message.channel.send(helpmessage);
    } else if (message.content === "/shuffle") {
        let randomwords = "【ライトノベルBOX】";
        randomwords += getRandomWord();
        message.channel.send(randomwords);
    } else if (message.content === "/status") {

    } else if (message.content === "/award") {
        let awardtitles = "【優秀タイトル】";
        awardtitles += getAwardTitles();
        message.channel.send(awardtitles);
    } else if (message.content.indexOf('/add') === 0) {
        let words = "";

        message.channel.send(addWords(words));
    } else if (message.content.indexOf('/remove') === 0) {
        let words = "";

        message.channel.send(removeWords(words));
    }
});


// openOrCreateDatabase();
// addWords("test3,hoge fuga NEW!");
// closeDatabase();

// client.login(token);


