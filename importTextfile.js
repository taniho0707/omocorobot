'use strict';

const fs = require("fs");
const sqlite3 = require('sqlite3').verbose();

const helpmessage = "\
usage: node importTextfile.js [importTextfile] [mergeSqliteFile]\
";

if (process.argv.length !== 4) {
    console.log(helpmessage);
    process.exit();
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
async function addWords (str, callback) {
    var doquery = async function (key) {
        return new Promise(resolve => {
            existWord(key).then(addWord).then(item => {
                resolve(item);
            });
        });
    }
    
    var keys = str.split("\n");
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
            message += noexistArray.length();
            message += " 個の単語，";
            for (var i of noexistArray) {
                message += "\"" + i + "\" ";
            }
            message += "を登録しました\n";
        }
        if (existCount !== 0) {
            message += existArray.length();
            message += " 個の単語，";
            for (var i of existArray) {
                message += "\"" + i + "\" ";
            }
            message += "は既に登録されています\n";
        }
        callback(message);
    });
}


// Databases
var dbWord = new sqlite3.Database(process.argv[3]);

dbWord.serialize(() => {
    dbWord.run('CREATE TABLE IF NOT EXISTS word (name TEXT PRIMARY KEY, rawname TEXT, enabled BOOLEAN)');
});

let words = fs.readFile(process.argv[2], 'utf-8', (err, data) => {
    if (err) {
        console.error(err);
    } else {
        if (data) {
            addWords(data, (msg) => {
                console.log(msg);
                dbWord.close();
                process.exit();
            });
        }
    }
});
