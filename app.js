/*
* NinjaBot-Steam
* Pedro Henrique - system.pedrohenrique@gmail.com
* github.com/systemmovie
*/

try {
	// Set global config
	process.env.TZ = "America/Sao_Paulo";
	
	var Helper = require('./Helper.js');
	Helper.print_logo();

	var SteamBot = require('./SteamBot.js');
	SteamBot.init();

} catch(err) {
	var error_message = "\n===================================================\n";
	
	if (typeof err === 'object') {
		if (err.message) {
			error_message = error_message + '\n' + (new Date()).toLocaleString() + ' - Message: ' + err.message;
		}
		if (err.stack) {
			error_message = error_message + '\nStacktrace:';
			error_message = error_message + '\n====================\n';
			error_message = error_message + err.stack;
		}

	} else {
		error_message = err;
	}

	console.log(error_message);

	var fs = require('fs');
	fs.appendFileSync('./logs/log_errors_app.log', String(error_message));
}
