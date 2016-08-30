var irc = require ('irc');
var S = require('string');

var settings = require('./settings');
var Database = require('./src/db');
var util = require('./src/util');
var user = require('./src/user');
var admin = require('./src/admin');

main();


function speak(text, bundle) {
    var lines = text.split("<br>");
    var truncated_lines = lines.slice(0, 3);

    for (var i = 0; i < truncated_lines.length; i++) {
        processed_text = util.htmlToIRC(S(truncated_lines[i]).decodeHTMLEntities().s);
        bundle.bot.say(bundle.to, processed_text);
        util.addToHistory({ "from": bundle.bot.opt.nick, "to": bundle.to, "text": processed_text }, bundle);
    }

    if (lines.length > truncated_lines.length) {
        speak("... (truncated output -- originally " + lines.length + " lines) ...", bundle);
    }
}

function setup(mode) {
    var mode_config = settings.modes[mode];
    var db = new Database(settings.database_file, mode);
    var password = undefined;
    var sasl = false;
    if (mode_config['password'] && mode_config['password'].length > 0) {
        var password = mode_config['password'];
        var sasl = true;
    }
    var bot = new irc.Client(
                mode_config['server'],
                mode_config['bot_name'],
                { 
                    channels: mode_config['channels'],
                    realName: 'IRC bot by Aqwis',
                    userName: S(mode_config['bot_name']).camelize().s,
                    sasl: sasl,
                    password: password
                }
            );

    util.logToFile.mode = mode;

    var reactToMessage = function(nick, to, text, message) {
        var trimmed_message = text.trim();
        var result_text = "";

        var bundle = {
            "mode": mode,
            "bot": bot,
            "nick": nick,
            "to": to,
            "db": db,
            "message": message,
        };

        util.addToHistory({"from": nick, "to": to, "text": text}, bundle);

        if (trimmed_message[0] === ".") {
            // Commands available to all users are prefixed with .
            user.lookupUserCommand(trimmed_message.slice(1), bundle, function(result_text) {
                if (result_text) {
                    speak(result_text, bundle);
                }
            });
        } else if (trimmed_message[0] === "@") {
            // Commands available to administrators are prefixed with @
            admin.lookupAdminCommand(trimmed_message.slice(1), bundle, function(result_text) {
                if (result_text) {
                    speak(result_text, bundle);
                }
            });
        } else if (trimmed_message[0] === "^") {
            user.repeatLine(trimmed_message.slice(1), bundle, function(result_text) {
                if (result_text) {
                    speak(result_text, bundle);
                }
            });
        }
    };

    bot.addListener("message#", reactToMessage);
    bot.addListener("action", reactToMessage);
    bot.addListener("message", function(nick, to, text, message) {
        if (to === mode_config['bot_name']) {
            reactToMessage(nick, nick, text, message);
        }
    });
    bot.addListener("error", function(message) {
        console.log('ERROR:', message);
    });
    bot.addListener("registered", function(messsage) {
        console.log('REGISTERED');
    });
    bot.addListener("motd", function(motd) {
        console.log('MOTD:', motd);
    });
    bot.addListener("topic", function(channel, topic, nick, message) {
        console.log('Topic (set by', nick, '):', topic);
    });
    bot.addListener("join", function(channel, nick, message) {
        console.log('JOIN:', nick, 'joined', channel);
    });
    bot.addListener("part", function(channel, nick, reason, message) {
        console.log('PART:', nick, 'left', channel);
    });
    bot.addListener("quit", function(nick, reason, channels, message) {
        console.log('QUIT:', nick, 'quit');
    });
    bot.addListener("kick", function(channel, nick, by, reason, message) {
        console.log('KICK:', nick, 'kicked from', channel, 'by', by);
    });
    bot.addListener("kill", function(nick, reason, channels, message) {
        console.log('KILL:', nick, 'was killed (', reason, ')');
    });
    bot.addListener("nick", function(oldnick, newnick, channels, message) {
        console.log('NICK:', oldnick, 'changed their nickname to', newnick);
    });
}

function convert(mode) {
    var db = new Database(settings.database_file, mode);

    db.convertToSqlite3(mode, function() {
        console.log("Finished converting.");
    });
}

function main() {
    var mode = process.argv[2];

    if (mode == "convert") {
        if (!(process.argv[3] in settings.modes)) {
            throw "Please specify a mode to convert"
        }
        convert(process.argv[3]);
    } else {
        if (!(mode in settings.modes)) {
            throw "Invalid mode";
        } else {
            setup(mode);
        }
    }
}
