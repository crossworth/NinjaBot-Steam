var DB = require('./Database.js');
var SteamAccount = require('./SteamAccount.js');
var Log = require('./Log.js');
var config = require('./config.json');
var Helper = require("./Helper.js");
var Cookie = require('cookie');
var os = require('os');

function SteamBot() {
	if (!SteamBot.instace) {
		SteamBot.instance = this;
	}

	this.ACCOUNTS = [];

	return SteamBot.instance;
}

SteamBot.prototype.SocketIO = require('socket.io')();

SteamBot.prototype.LAST_CHECK = 0;

SteamBot.prototype.listen = function() {
	SteamBot.prototype.SocketIO.listen(config.socket.port);
};

SteamBot.prototype.find_account_id = function(email) {
	for(var i = 0; i < this.ACCOUNTS.length; i++) {
		if (this.ACCOUNTS[i] && this.ACCOUNTS[i].get_email() == email) {
			return i;
		}
	}

	return -1;
};

SteamBot.prototype.add_steam_account = function(email, login, password, shared_secret, socket) {
	if (!shared_secret) {
		shared_secret = "";
	}

	this.ACCOUNTS.push(new SteamAccount({
		login: login,
		password: password,
		shared_secret: shared_secret,
		email: email,
	}, socket));

	this.ACCOUNTS[this.ACCOUNTS.length - 1].logon();

	Log("Conta da Steam adiciona ao Worker do Bot", email);
};

// callback(boolean)
SteamBot.prototype.remove_steam_account = function(email, callback) {
	for(var i = 0; i < this.ACCOUNTS.length; i++) {
		if (this.ACCOUNTS[i].get_email() == email) {
			this.ACCOUNTS[i].logoff();
			callback(true);

			this.ACCOUNTS.splice(i, 1);
			Log("Conta da Steam removida com sucesso", email);
			return;
		}
	}

	Log("Conta não encontrada", email);
	callback(false);
};

// callback(boolean)
SteamBot.prototype.do_login = function(email, password, callback) {
	DB.find_account(email, function(result) {
		if (result.length > 0 && result[0].password == password) {
			callback(true);
		} else {
			callback(false);
		}
	});
};

SteamBot.prototype.register_user = function(email, password, callback) {
	DB.create_account({
		email: email,
		password: password
	}, function(err, msg) {
		if (err) {
			callback(msg, false);
		} else {
			Log("Conta " + email + " registrada com sucesso", email);
			callback(null, true);
		}
	});
};

SteamBot.prototype.init = function() {
	// load all accounts
	// create all user's object's

	Log("SteamBot UP");

	var self = this;

	DB.get_all_accounts(function(accounts) {
		for(var i = 0; i < accounts.length; i++) {
			if (accounts[i].steam_acc && accounts[i].steam_pass) {
				// Create an SteamAccount object for each user on database
				self.ACCOUNTS.push(new SteamAccount({
					login: accounts[i].steam_acc,
					password: accounts[i].steam_pass,
					shared_secret: accounts[i].steam_shared_secret,
					email: accounts[i].email,
				}));

				self.ACCOUNTS[self.ACCOUNTS.length - 1].logon();
			}
		}

		SteamBot.prototype.LAST_CHECK = Helper.get_time_seconds();
		SteamBot.prototype.listen();

	});

	SteamBot.prototype.SocketIO.on('connection', function (socket) {
		// save the email address to the current socket
		socket.on('steambot client email', function(payload) {
			socket.email = payload.email;

			function bind_socket_functions(socket, account_id) {
				self.ACCOUNTS[account_id].set_socket(socket);

				// send the number of new items to the interface
				socket.emit('steambot steam new itens', {number: self.ACCOUNTS[account_id].client._NEW_ITENS});

				if (self.ACCOUNTS[account_id].client._REQUESTING_STEAMGUARD_CODE) {
					socket.emit('steambot steam steamguard', {});
				}

				if (self.ACCOUNTS[account_id].client._CHECK_EVERY_TIME == false) {
					// check every 2 hours
					socket.emit('steambot last check', {time: SteamBot.prototype.LAST_CHECK, seconds: 7200});
				}

				if (self.ACCOUNTS[account_id].client._IS_LOGGED) {
					socket.emit('steambot steam status', {status: "online"});
				} else {
					socket.emit('steambot steam status', {status: "offline"});
				}

				if (self.ACCOUNTS[account_id].client._SHARED_SECRET) {
					socket.emit('steambot steam steamguard shared_secret enable', {});
				}

				socket.on('steambot client steamguard generate code', function(payload) {
					socket.emit('steambot new steamguard code generated', {code: self.ACCOUNTS[account_id].get_steamguard_code()});
				});

				socket.on('steambot client steamguard', function(payload) {
					var account_id = self.find_account_id(socket.email);

					if (account_id == -1) {
						Log("Erro ao encontrar a conta Steam", socket.email);
						return;
					}

					self.ACCOUNTS[account_id].client._CALLBACK_CODE_STAMGUARD(payload.code);
				});


				socket.on('steambot client check games', function(payload) {
					var account_id = self.find_account_id(socket.email);

					if (account_id == -1) {
						Log("Erro ao encontrar a conta Steam", socket.email);
						return;
					}

					self.ACCOUNTS[account_id].client.force_check_games();
				});

				socket.on('steambot client add steam game', function(payload) {
					var account_id = self.find_account_id(socket.email);

					if (account_id == -1) {
						Log("Erro ao encontrar a conta Steam", socket.email);
						return;
					}

					var from_user = null;

					if (payload.from_user) {
						from_user = payload.from_user;
					}

					self.ACCOUNTS[account_id].client._ADD_NEW_GAME(payload.code, from_user);
				});

				socket.on('steambot client get steam game keys', function(payload) {
					var account_id = self.find_account_id(socket.email);

					if (account_id == -1) {
						Log("Erro ao encontrar a conta Steam", socket.email);
						return;
					}

					var apps_owned = [];

					if (account_id != -1) {
						apps_owned = self.ACCOUNTS[account_id].client._GAMES_OWNED;
					}

					DB.get_all_serial_code(function(result) {
						socket.emit('steambot steam game keys', {keys: result, apps_owned: apps_owned});
					});
				});
			} // bind_socket_functions

			DB.get_email_logs(socket.email, function(result) {
				socket.emit('steambot full log', { data: result});

				Log().set_callback_on_log(function(message, email) {
					if (socket) {
						if (email  == socket.email) {
							var date = (new Date()).toLocaleString();
							socket.emit('steambot new log', { date: date, log: message });
						}
					}
				});
			});

			socket.on('steambot client add steam account', function(payload) {
				Log("Adicionando conta Steam", socket.email);
				var shared_secret = payload.shared_secret || "";
				self.add_steam_account(socket.email, payload.login, payload.password, shared_secret, socket);
				bind_socket_functions(socket, self.ACCOUNTS.length - 1);
			});

			socket.on('steambot client remove steam account', function(payload) {
				Log("Removendo conta steam", socket.email);
				self.remove_steam_account(socket.email, function() {
					socket.emit('stembot steam status', {status: "offline"});
					SteamAccount.prototype.remove_steam_credentials_on_db(socket.email);
				});
			});

			var account_id = self.find_account_id(socket.email);

			if (account_id == -1) {
				socket.emit('steambot steam status', {status: "offline"});
			} else {
				bind_socket_functions(socket, account_id);
			} 
	
		}); // steambot client email


		socket.emit('steambot uptime', {uptime: os.uptime()});
		// check every 10 minutes = 600 seconds
		socket.emit('steambot last check', {time: SteamBot.prototype.LAST_CHECK, seconds: 600});
	}); // on connection

	SteamBot.prototype.SocketIO.set('authorization', function (handshakeData, accept) {
		// login
		if (handshakeData.headers.cookie) {
			handshakeData.cookie = Cookie.parse(handshakeData.headers.cookie);

			if (handshakeData.cookie.login == 'true' && handshakeData.cookie.email && handshakeData.cookie.password) {
				SteamBot.prototype.do_login(handshakeData.cookie.email, handshakeData.cookie.password, function(result) {
					if (result == true) {
						accept(null, true);
					} else {
						accept(null, false);
					}
				});
				return;
			} else if (handshakeData.cookie.register == 'true' && handshakeData.cookie.email && handshakeData.cookie.password) {
				SteamBot.prototype.register_user(handshakeData.cookie.email, handshakeData.cookie.password, function(err, result) {
					if (err) {
						accept(err, false);
					} else {
						Log("Conta registrada com sucesso", handshakeData.cookie.email);
						accept(null, true);
					}
				});
			}
		}

		accept(null, false);
	}); // set authorization


	this.intervalHandle = setInterval(function() {
		SteamBot.prototype.LAST_CHECK = Helper.get_time_seconds();
		
		for(var i = 0; i < self.ACCOUNTS.length; i++) {
			self.ACCOUNTS[i].check_games();

			if (self.ACCOUNTS[i].socket) {
				if (self.ACCOUNTS[account_id].client._CHECK_EVERY_TIME == false) {
					// check every 2 hours
					self.ACCOUNTS[i].socket.emit('steambot last check', {time: SteamBot.prototype.LAST_CHECK, seconds: 7200});
				}
			}
		}

		SteamBot.prototype.SocketIO.sockets.emit('steambot new check', {});
		SteamBot.prototype.SocketIO.sockets.emit('stembot uptime', {uptime: os.uptime()});
		DB.logs_compactDatabase();
	}, 10 * 60 * 1000); // 10 * 60 * 1000  10 minutes

	this.intervalHandle.unref();

};


var SteamBotHandle = new SteamBot();

module.exports = SteamBotHandle;