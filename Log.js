var DB = require('./Database.js');
var Helper = require('./Helper.js');

// How to use
// var Log = require('./Log.js');
// Log("teste", "sys@mail.com");
// Log().set_callback_on_log(function(message, email) {
//     socket.doSomeWork("Call from callback", message);
// });

function LogManager(message, email) {
	if (!LogManager.instance) {
		LogManager.instance = this;
		this.callback_on_log = null;
		this.name = message;
	}

	if (message) {
		LogManager.prototype.log.call(LogManager.instance, message, email);	
	}

	return LogManager.instance;
}

LogManager.prototype.set_callback_on_log = function(callback) {
	this.callback_on_log = callback;
};

LogManager.prototype.log = function(message, email) {
	var message_clear = Helper.strip_html(message);
	if (email) {
		DB.save_log(message, email);
		console.log(Helper.get_date_formated(), email, " - " ,message_clear);
	} else {
		console.log(Helper.get_date_formated(), message_clear);
	}

	if (this.callback_on_log) {
		this.callback_on_log(message, email);
	}
};

function Log(message, email) {
	return new LogManager(message, email);
}

module.exports = Log;