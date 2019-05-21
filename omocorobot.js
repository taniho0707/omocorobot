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

        // // Prepared Statement でデータを挿入する
        // const stmt = dbWord.prepare('INSERT INTO user VALUES (?, ?)');
        // stmt.run(['Foo', 25]);
        // stmt.run(['Bar', 39]);
        // stmt.run(['Baz', 31]);

        // // prepare() で取得した Prepared Statement オブジェクトをクローズする。これをコールしないとエラーになる
        // stmt.finalize();
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

}

// 単語を1個追加/有効化する
function addWord (str) {

}

// 複数の単語をデータベースに追加/有効化します
function addWords (str) {

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
// closeDatabase();

client.login(token);


