var Helper = require("./Helper.js");
var Log = require('./Log.js');
var DB = require('./Database.js');

var SteamUser = require('steam-user');
var SteamTotp = require('steam-totp');
var Request = require('request');
var Cheerio = require('cheerio');


var Steam = SteamUser.Steam;
Request = Request.defaults({jar: true});


function SteamAccount(settings, socket) {
	var steam_account_self = this;

	this.socket = null;
	this.client._LAST_TIME_CHECKED = null;

	if (socket) {
		this.socket = socket;
	}

	this.settings = this.default.extend(settings);
	this.client = new SteamUser({enablePicsCache: true, promptSteamGuardCode: false});

	this.client._LOGIN = this.settings.login;
	this.client._PASSWORD = this.settings.password;
	this.client._EMAIL = this.settings.email;
	this.client._SHARED_SECRET = this.settings.shared_secret;

	this.client._GAMES_OWNED = [];
	this.client._GAMES_LIST = [];

	this.client._GAMES_PLAYING = null;
	this.client._IS_LOGGED = false;

	this.client._NEW_ITENS = 0;
	
	this.client._CHECK_GAMES = null;
	this.client._CHECK_EVERY_TIME = true;
	this.client._CHECK_COUNT = 0;
	this.client._FARM_TRADING_CARDS = null;
	this.client._ADD_NEW_GAME = null;
	
	this.client._REQUESTING_STEAMGUARD_CODE = false;

	this.client._CALLBACK_ON_LOGIN = this.settings.callback_on_login;
	this.client._CALLBACK_ON_STEAMGUARD = this.settings.callback_on_steamguard;
	this.client._CALLBACK_ON_STATUS_CHANGE = this.settings.callback_on_status_change;
	this.client._CALLBACK_ON_NEW_ITENS = this.settings.callback_on_new_itens;
	this.client._CALLBACK_CODE_STAMGUARD = null;

	this.client.on('loggedOn', function() {
		Log("Login efetuado com sucesso na Steam", this._EMAIL);

		this.setPersona(SteamUser.Steam.EPersonaState.Online);
		this._IS_LOGGED = true;
		this._REQUESTING_STEAMGUARD_CODE = false;

		this._CALLBACK_ON_STATUS_CHANGE.call(steam_account_self, "online");

		SteamAccount.prototype.save_steam_credentials_on_db.call(steam_account_self, this._EMAIL, this._LOGIN, this._PASSWORD, this._SHARED_SECRET);
		
		if (this._CALLBACK_ON_LOGIN) {
			this._CALLBACK_ON_LOGIN.call(steam_account_self, {logged: true, email: this._EMAIL});
		}
	}); // on loggedOn
	
	this.client.on('error', function(error) {
		if (error.message) {
			if (error.message == "InvalidPassword") {
				error.message = " 'InvalidPassword' <small>Pode ser causado por muitas tentativas de login incorretas, tente novamente mais tarde</small>";
			}
			this._CALLBACK_ON_STATUS_CHANGE.call(steam_account_self, "offline");
			Log("Erro na Steam: " + error.message, this._EMAIL);

		} else {
			Log(error, this._EMAIL);
		}
	}); // on error

	this.client.on('steamGuard', function(domain, callback) {
		this._CALLBACK_ON_STATUS_CHANGE.call(steam_account_self, "steamguard");

		if (this._SHARED_SECRET && this._SHARED_SECRET.length > 0) {
			Log("Inserindo Código do SteamGuard", this._EMAIL);
			callback(SteamTotp.generateAuthCode(this._SHARED_SECRET));
			return;
		}

		Log("Você deve informar o Código do SteamGuard", this._EMAIL);

		this._CALLBACK_CODE_STAMGUARD = callback;
		this._REQUESTING_STEAMGUARD_CODE = true;
		
		if (this._CALLBACK_ON_STEAMGUARD) {
			this._CALLBACK_ON_STEAMGUARD.call(steam_account_self, callback);
		} else {
			Log("O callback para o SteamGuard não foi informado", this._EMAIL);
		}
	}); // on steamGuard

	this.client.once('appOwnershipCached', function() {
		Log("Conseguindo lista de jogos da conta", this._EMAIL);

		this._GAMES_OWNED = [];

		var $client = this;

		this.getProductInfo(this.getOwnedApps(), [], function(apps, packages, unknownApps, unknownPackages) {
			for (var app in apps) {
				if (apps[app].appinfo && apps[app].appinfo.common && apps[app].appinfo.common.type == "Game" && apps[app].appinfo.common.name.indexOf('Dedicated Server') == -1) {
					$client._GAMES_OWNED.push(apps[app].appinfo.common.name);
				}
			}
		});

		this._CHECK_GAMES();
	}); // once appOwnershipCached

	this.client.on('newItems', function(count) {
		if (count > 1) {
			Log(count + " novos itens no inventário", this._EMAIL);
		} else {
			Log(count + " novo item no inventário", this._EMAIL);
		}

		this._NEW_ITENS = count;
		this._CALLBACK_ON_NEW_ITENS.call(steam_account_self, count);
	}); // on newItems

	this.client.on('disconnected', function() {
		Log("Conta da Steam desconectada", this._EMAIL);
		this._CALLBACK_ON_STATUS_CHANGE.call(steam_account_self, "offline");
	}); // on disconnected

	this.client._CHECK_GAMES = function() {

		if (this._IS_LOGGED == false) {
			return;
		}

		var $client = this;
		$client._GAMES_LIST = [];

		var cookies_jar = Request.jar();

		// sometimes the steam account for some reason just disconnect with no message
		// this fix the problem
		if (this._IS_LOGGED && this.steamID === null) {
			Log("Conta da Steam desconectada, tentando fazer login novamente...", this._EMAIL);

			this._CALLBACK_ON_STATUS_CHANGE.call(steam_account_self, "offline");

			this.logOn({
				"accountName": this._LOGIN,
				"password": this._PASSWORD
			});

			return;
		}

		Log("Verificando jogos com Cartas Colecionáveis", this._EMAIL);

		this.webLogOn();
		this.once('webSession', function(sessionID, cookies) {

			cookies.forEach(function(cookie) {
				cookies_jar.setCookie(cookie, 'https://steamcommunity.com');
			});

			Request({ url: "https://steamcommunity.com/my/badges/", jar: cookies_jar}, function(err, response, body) {
				if(err || response.statusCode != 200) {
					Log("Não foi possível acessar a página de Badges: " + (err || "HTTP error " + response.statusCode) + ". Tentando novamente em 30 segundos...", $client._EMAIL);
					setTimeout(function() {
						var ref_client = $client;
						return function() {
							ref_client._CHECK_GAMES();
						}
					}(), 30 * 1000);
					return;
				}

				var $ = Cheerio.load(body);

				$('.btn_green_white_innerfade.btn_small_thin').each(function() {
					var div_element = $(this).parent().parent();

					var app_id = div_element.find(".btn_green_white_innerfade.btn_small_thin")[0].attribs.href;
					app_id = app_id.substr(12)

					app_id = parseInt(app_id, 10);

					if(!app_id || app_id == 0) {
						Log("Erro ao conseguir os id's dos jogos da lista de badges", $client._EMAIL);
						return;
					}

					var name = div_element.parent().find('.badge_title');
					name.find('.badge_view_details').remove();
					name = name.text().replace(/\n/g, '').replace(/\r/g, '').replace(/\t/g, '').trim();				

					// check if we do have the game, just to make sure
					if(!$client.ownsApp(app_id)) {
						Log("Pulando <strong>" + name + "</strong> razão: não possui o jogo", $client._EMAIL);
						return;
					}

					var play_time_game = div_element.find('.badge_title_stats_playtime').text();
					var first_digit = play_time_game.match(/\d/);
					var pos_end = play_time_game.indexOf(" hrs on record");
					var pos_start = play_time_game.indexOf(first_digit);
					play_time_game = play_time_game.slice(pos_start, pos_end);

					Log("Jogo <strong>" +  name + "</strong> adicionado a fila, " + play_time_game + " horas registradas", $client._EMAIL);

					$client._GAMES_LIST.push({
						id: app_id,
						name: name,
						play_time: play_time_game
					});
				});

				if ($client._GAMES_LIST.length > 0) {
					$client._FARM_TRADING_CARDS();
					$client._CHECK_EVERY_TIME = true;
				} else {
					$client._CHECK_EVERY_TIME = false;
					Log("Você não possui mais nenhum jogo com drop de Cartas Colecionáveis", $client._EMAIL);
				}
			}); // Request
		}); // webSession


		$client._LAST_TIME_CHECKED = Helper.get_time_seconds();
	}; // _CHECK_GAMES

	this.client._FARM_TRADING_CARDS = function() {
		if (this._IS_LOGGED == false) {
			return;
		}

		var games_with_less_than_2_hours = [];

		for(var i = 0; i < this._GAMES_LIST.length; i++) {
			var time = parseInt(this._GAMES_LIST[i].play_time, 10);
			if( isNaN(time) || time < 2) {
				games_with_less_than_2_hours.push({name: this._GAMES_LIST[i].name, id: parseInt(this._GAMES_LIST[i].id, 10)});
			}
		}

		if (games_with_less_than_2_hours.length > 0) {
			Log("<strong>" + games_with_less_than_2_hours.length + "</strong> jogos com menos de 2 horas, farmando todos até conseguir 2 horas em cada", this._EMAIL);

			var app_ids = [];
			var game_names = "";
			for (var i = 0; i < games_with_less_than_2_hours.length; i++) {
				app_ids.push(games_with_less_than_2_hours[i].id);
				game_names = game_names + games_with_less_than_2_hours[i].name + ", ";
			}

			game_names = game_names.slice(0, -2); // remove the last comma

			// just execute if the game has not been playing already
			if (this._GAMES_PLAYING != JSON.stringify(app_ids)) {
				this.gamesPlayed(app_ids);
				this._GAMES_PLAYING = JSON.stringify(app_ids);
			}

			Log("Farmando jogos <strong>" + game_names + "</strong>", this._EMAIL);

		} else {
			if (this._GAMES_LIST.length > 0) {
				var app_id = parseInt(this._GAMES_LIST[0].id, 10);

				if (this._GAMES_PLAYING != JSON.stringify(app_id)) {
					this.gamesPlayed(app_id);
					this._GAMES_PLAYING != JSON.stringify(app_id);
				}
				
				Log("Farmando jogo <strong>" + this._GAMES_LIST[0].name + "</strong> agora", this._EMAIL);
			}
		}
	}; // _FARM_TRADING_CARDS

	this.client._ADD_NEW_GAME = function(key, from_user) {
		if (this._IS_LOGGED == false) {
			return;
		}

		$client = this;
		this.redeemKey(key, function(result, details, packages) {
			var name = packages[Object.keys(packages)[0]];

			if (details == SteamUser.EPurchaseResult.OK) {
				Log("Novo jogo adicionado <strong>" + name + "</strong>", $client._EMAIL);
				$client._GAMES_OWNED.push(name);
				DB.remove_serial_code(key);
				$client._CHECK_GAMES();
			} else if (details == SteamUser.EPurchaseResult.AlreadyOwned) {
				Log("Erro: O jogo <strong>" + name + "</strong> já está na biblioteca", $client._EMAIL);
				DB.add_serial_code(key, $client._LOGIN, name);
			} else if (details == SteamUser.EPurchaseResult.InvalidKey) {
				Log("Erro: <strong>Código inválido</strong>");
				DB.remove_serial_code(key);
			} else if (details == SteamUser.EPurchaseResult.DuplicatedKey) {
				Log("Erro: <strong>Código duplicado</strong>", $client._EMAIL);
				DB.remove_serial_code(key);
			} else if (details == SteamUser.EPurchaseResult.OnCooldown) {
				Log("Erro: <strong>Muitas tentativas sem sucesso</strong>, tente novamente mais tarde", $client._EMAIL);
			} else {
				Log("Ocorreu um erro ao tentar adicionar o código do jogo: " + details, $client._EMAIL);
			}		
		});
	}; // _ADD_NEW_GAME

}

SteamAccount.prototype.logon = function () {
	this.client.logOn({
		"accountName": this.settings.login,
		"password": this.settings.password
	});
};

SteamAccount.prototype.set_last_time_check = function (time) {
	this.client._LAST_TIME_CHECKED = time;
};

SteamAccount.prototype.get_last_time_check = function () {
	return this.client._LAST_TIME_CHECKED;
};


SteamAccount.prototype.logoff = function () {
	this.client._IS_LOGGED = false;
	this.settings.callback_on_status_change.call(this, "offline");
	this.client.logOff();
};

SteamAccount.prototype.check_games = function () {
	if (this.client._CHECK_EVERY_TIME) {
		this.client._CHECK_GAMES();
		Log("Verificando jogos", this.settings.email);
	} else {
		this.client._CHECK_COUNT++;
		// check every 2 hours if we dont find any game
		// this will be called every 10 minutes, 10 * 12 = 120/60 = 2
		if (this.client._CHECK_COUNT > 12) {
			this.client._CHECK_GAMES();
			this.client._CHECK_COUNT = 0;
		}
	}
};

SteamAccount.prototype.force_check_games = function () {
	this.client._CHECK_GAMES();
};


SteamAccount.prototype.get_steamguard_code = function () {
	if (this.client._SHARED_SECRET) {
		return SteamTotp.generateAuthCode(this.client._SHARED_SECRET);
	} else {
		return "";
	}
};

SteamAccount.prototype.save_steam_credentials_on_db = function(email, login, password, shared_secret) {
	if (!shared_secret) {
		shared_secret = "";
	}

	DB.update_account(email, {
		steam_acc: login,
		steam_pass: password,
		steam_shared_secret: shared_secret
	}, function(err, msg) {
		if (err) {
			Log(msg, email);
		}
	});
};

SteamAccount.prototype.remove_steam_credentials_on_db = function(email) {
	DB.update_account(email, {
		steam_acc: "",
		steam_pass: "",
		steam_shared_secret: ""
	}, function(err, msg) {
		Log(msg, email);
	});
};


SteamAccount.prototype.set_socket = function(socket) {
	this.socket = socket;
};

SteamAccount.prototype.emit = function(event, data) {
	if (this.socket) {
		this.socket.emit(event, data);
	}
};

SteamAccount.prototype.default = {
	login: "",
	password: "",
	shared_secret: "",
	email: "",
	require_steam_guard: false,
	callback_on_login: function() {
		this.settings.require_steam_guard = false;
		this.emit('steambot steam status', {status: "online"});
	},
	callback_on_steamguard: function() {
		this.settings.require_steam_guard = true;
		this.emit('steambot steam steamguard', {});
	},
	callback_on_status_change: function(status) {
		this.emit('steambot steam status', {status: status});
	},
	callback_on_new_itens: function(number) {
		this.emit('steambot steam new itens', {number: number});
	}
};

SteamAccount.prototype.get_email = function() {
	return this.settings.email;
};

module.exports = SteamAccount;