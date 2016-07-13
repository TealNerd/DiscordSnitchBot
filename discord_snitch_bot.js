var readline = require('readline');
var color = require("ansi-color").set;
var mc = require('minecraft-protocol');
var states = mc.states;
var util = require('util');
var Discord = require('discord.js');
var dateFormat = require('dateformat');

var colors = {
  "black": 'black+white_bg',
  "dark_blue": 'blue',
  "dark_green": 'green',
  "dark_aqua": 'cyan',
  "dark_red": 'red',
  "dark_purple": 'magenta',
  "gold": 'yellow',
  "gray": 'black+white_bg',
  "dark_gray": 'black+white_bg',
  "blue": 'blue',
  "green": 'green',
  "aqua": 'cyan',
  "red": 'red',
  "light_purple": 'magenta',
  "yellow": 'yellow',
  "white": 'white',
  "obfuscated": 'blink',
  "bold": 'bold',
  "strikethrough": '',
  "underlined": 'underlined',
  "italic": '',
  "reset": 'white+black_bg'
};

var dictionary = {
  "chat.stream.emote": "(%s) * %s %s",
  "chat.stream.text": "(%s) <%s> %s",
  "chat.type.achievement": "%s has just earned the achievement %s",
  "chat.type.admin": "[%s: %s]",
  "chat.type.announcement": "[%s] %s",
  "chat.type.emote": "* %s %s",
  "chat.type.text": "<%s> %s"
};

var rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

function print_help() {
  console.log("usage: node discord_snitch_bot.js <hostname> <port> <user> <password> <token> <server-id> <channel-name> [<mcversion>]");
}

if(process.argv.length < 8) {
  console.log("Too few arguments!");
  print_help();
  process.exit(1);
}

process.argv.forEach(function(val) {
  if(val == "-h") {
    print_help();
    process.exit(0);
  }
});

var host = process.argv[2];
var port = parseInt(process.argv[3]);
var user = process.argv[4];
var passwd = process.argv[5];
var token = process.argv[6];
var server_id = process.argv[7];
var channel_name = process.argv[8]
var version = process.argv[9] ? process.argv[9] : '1.10';

if(host.indexOf(':') != -1) {
  port = host.substring(host.indexOf(':') + 1);
  host = host.substring(0, host.indexOf(':'));
}

console.log("connecting to " + host + ":" + port);
console.log("user: " + user);

var client = mc.createClient({
  host: host,
  port: port,
  username: user,
  password: passwd,
  version: version
});

var discordBot = new Discord.Client();

var chan = null;

discordBot.on('ready', function() {
  console.log('Connected to discord');
  discordBot.servers.forEach(function(server) {
	if(server.id == server_id) {
      console.log('Connected to Discord server: ' + server.name);
	  chan = server.channels.get('name', channel_name);
	  discordBot.sendMessage(chan, 'snitchbot connected');
	}
  });
});

var players = [];

discordBot.on('message', function(message) {
  if(message.channel.isPrivate) {
	if(message.content == 'playerlist') {
	  var playerMessage = "The following players are online:\n";
	  players.forEach(function(player) {
		playerMessage += player + "\n";
	  });
	  discordBot.sendMessage(message.channel, playerMessage);
	}
  }
});

client.on('player_info', function(packet) {
  if(packet.action == 0) {
	packet.data.forEach(function(content) {
	  if(players.indexOf(content.name) == -1) {
	    players.push(content.name);
	  }
	});
  } else if (packet.action == 4) {
	packet.data.forEach(function(content) {
	  var i = players.indexOf(content.name);
	  if(i != -1) {
		players.splice(i, 1);
	  }
	});
  }
});

client.on('kick_disconnect', function(packet) {
  console.info(color('Kicked for ' + packet.reason, "blink+red"));
  reconnect();
});

var chats = [];

var connected = false;

client.on('connect', function() {
  console.info(color('Successfully connected to ' + host + ':' + port, "blink+green"));
  connected = true;
});

client.on('disconnect', function(packet) {
  console.log('disconnected: '+ packet.reason);
  reconnect();
});

function reconnect() {
  connected = false;
  while(!connected) {
	sleep(12600);
	client.connect(host, port);
  }
}

function sleep (time) {
  var now = new Date().getTime();
  while(now < now + time) {}
}

client.on('end', function() {
  console.log("Connection lost");
  process.exit();
});

client.on('error', function(err) {
  console.log("Error occured");
  console.log(err);
  process.exit(1);
});

client.on('state', function(newState) {
  if(newState === states.PLAY) {
    chats.forEach(function(chat) {
      client.write('chat', {message: chat});
    });
  }
});

rl.on('line', function(line) {
  if(line == '') {
    return;
  } else if(line == '/quit') {
    console.info('Disconnected from ' + host + ':' + port);
    client.end();
    return;
  } else if(line == '/end') {
    console.info('Forcibly ended client');
    process.exit(0);
    return;
  }
  if(!client.write('chat', {message: line})) {
    chats.push(line);
  }
});

client.on('chat', function(packet) {
  var j = JSON.parse(packet.message);
  var chat = getPlainText(j);
  console.info(chat);
  if(isSnitch(chat)) {
	sendSnitchMessage(getFormattedDate() + chat);
  }
});

function sendSnitchMessage(message) {
  discordBot.sendMessage(chan, message);
}

function getFormattedDate() {
	var now = new Date();
	var utc = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),  now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds());
	return "[" + dateFormat(utc, "m/dd/yy h:MM TT") + "]";
}

var re = /^ \* ([a-zA-Z0-9_]+) (entered|logged out in|logged in to) snitch at (.*?)\[(world.*?) ([-]?[0-9]+) ([-]?[0-9]+) ([-]?[0-9]+)\]$/;
function isSnitch(message) {
  return re.test(message);
}

function getPlainText(chatObj) {
  if(typeof chatObj === "string") {
	return chatObj;
  } else {
	var chat = "";
	if('text' in chatObj) {
		chat += chatObj.text;
	}
	if (chatObj.extra) {
      chatObj.extra.forEach(function(item) {
        chat += getPlainText(item);
      });
    }
	return chat;
  }
}

discordBot.loginWithToken(token);
