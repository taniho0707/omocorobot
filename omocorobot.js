'use strict';

const fs = require("fs");
const config = require("config");
const log4js = require("log4js");
const Discord = require("discord.js");
const request = require('sync-request');

const client = new Discord.Client();

const helpmessage = "\
【ライトノベルBOXの使い方】\n\
/help : このヘルプを表示します\n\
/shuffle : ランダムに4つの言葉を表示します\n\
/add word : 新しい言葉を1つ追加します\n\
/remove word : 既に存在する言葉を1つ削除します\n\
/refresh : 単語リストの同期を行います\n\
/status : 最終バックアップ日時を表示します\n\
\n\
元ネタ : 【ラノベ】売れるライトノベルのタイトルを単語シャッフルで作ってみた | オモコロ http://omocoro.jp/kiji/108660/";

log4js.configure(config.log4js);
const defaultLogger = log4js.getLogger('default');
const debugLogger = log4js.getLogger('debug');
const errorLogger = log4js.getLogger('error');
process.on('unhandledRejection', errorLogger.error);
defaultLogger.info('run omocorobot');


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




client.on('ready', () => {
    defaultLogger.info('omocorobot started');
});

client.on('message', message => {
    if (message.content.indexOf('ping') === 0) {
        message.channel.send('pong');
    }
});

client.login(token);


