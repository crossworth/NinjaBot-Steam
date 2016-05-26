var config = require('./config.json');
var Helper = require('./Helper.js');

var Nedb = require('nedb');
var fs = require('fs');

require('magic-globals');

// __db_err(err, __fili);
function __db_err(err, where) {
	if (err) {
		console.log(Helper.get_date_formated() + " Erro ao tentar manipular as informações no banco de dados, " + where);
		console.log(err);
		return;
    }
}

function Database() {
	this.datastore = [];
	this.datastore['accounts'] = new Nedb({filename: config.database.accounts, autoload: true});
	this.datastore['logs'] = new Nedb({filename: config.database.logs, autoload: true});
	this.datastore['keys'] = new Nedb({filename: config.database.keys, autoload: true});

	this.datastore['logs'].ensureIndex({fieldName : 'id_sort'});

	this._log_index_inc_name = "./.log_index_inc";
	this.log_inc = 0;

	try {
		this.log_inc = fs.readFileSync(this._log_index_inc_name, "utf8");
		this.log_inc = parseInt(this.log_inc, 10);
	} catch(err) {
		if (err.code == "ENOENT") {
			this.save_increment_index_file();
		} else {
			console.log(err);
		}
	}
}

Database.prototype.code = {
	type: "serial_code",
	from_steam_login: "",
	game: "",
	code: ""
};

Database.prototype.add_serial_code = function(code, from_steam_login, game) {
	var self = this;
	
	this.find_serial_code({type: "serial_code", from_steam_login: from_steam_login, game: game, code: code}, function(result) {
		if (result.length < 1) {
			self.datastore['keys'].insert({type: "serial_code", from_steam_login: from_steam_login, game: game, code: code}, function(err, result) { 
				__db_err(err, __fili);
			});
		}
	});	
};

Database.prototype.get_all_serial_code = function(callback) {
	this.datastore['keys'].find({type: "serial_code"}, function(err, result) {
		__db_err(err, __fili);
		callback(result);
	});
};

Database.prototype.find_serial_code = function(code, callback) {
	this.datastore['keys'].find({type: "serial_code", code: code}, function(err, result) {
		__db_err(err, __fili);
		callback(result);
	});
};

Database.prototype.remove_serial_code = function(code) {
	this.datastore['keys'].remove({type: "serial_code", code: code}, {}, function (err, numRemoved) {
		__db_err(err, __fili); }
	);
};

Database.prototype.log = {
	type: "log",
	id_sort: 0,
	message: "",
	email: "",
	date: (new Date()).toLocaleString()
};

Database.prototype.save_increment_index_file = function() {
	fs.writeFileSync(this._log_index_inc_name, this.log_inc.toString());
};

Database.prototype.save_log = function(message, email) {
	if (typeof message == "Object") {
		message = JSON.stringify(message);
	}

	var self = this;


	this.datastore['logs'].insert({type: "log", id_sort: this.log_inc++, message: message, email: email, date: (new Date()).toLocaleString() }, function(err, result) { 
		__db_err(err, __fili);
		self.save_increment_index_file(self);
	});

	self.cleanup_logs(email, this.log_inc);

};

Database.prototype.logs_compactDatabase =  function() {
	this.datastore['logs'].persistence.compactDatafile();
};

Database.prototype.get_email_logs = function(email, callback) {
	this.datastore['logs'].find({type: "log", email: email}).sort({id_sort: -1}).exec(function(err, result) {
		__db_err(err, __fili);
		callback(result);
	});

};

Database.prototype.cleanup_logs = function(email, last_id) {

	var id_remove = last_id - 100;

	this.datastore['logs'].remove({type: "log", email: email, id_sort: {$lte: id_remove}}, { multi: true }, function (err, numRemoved) {
		__db_err(err, __fili);
	});
};

Database.prototype.get_all_logs = function(callback) {
	this.datastore['logs'].find({type: "log"}).sort({id_sort: -1}).exec(function(err, result) {
		__db_err(err, __fili);
		callback(result);
	});
};


Database.prototype.account = {
	type: "account",
	email: "",
	password: "",
	steam_acc: "",
	steam_pass: "",
	steam_shared_secret: ""
};

Database.prototype.create_account = function(info, callback) {
	var account = Database.prototype.account;
	account = Database.prototype.account.extend(info);

	if (!account.email && !account.password) {
		callback(true,"Você deve informar um email e uma senha");
		return;
	}

	var self = this;

	this.find_account(account.email, function(result) {
		if (result.length > 0) {
			callback(true, "Conta já registrada");
		} else {
			self.datastore['accounts'].insert(account, function(err, result) { 
				__db_err(err, __fili);
				callback(false, "Cadastro realizado com sucesso");
			});
		}
	});
};

Database.prototype.update_account = function(email, new_data, callback) {

	if (!email) {
		callback(true, "Você deve informar o email da conta a ser atualizado");
		return;
	}

	var self = this;

	this.find_account(email, function(result) {
		if (result.length > 0) {

			var account = result[0];
			account = account.extend(new_data);

			if (!account.password) {
				callback(true, "Você deve informar uma senha");
				return;
			}

			self.datastore['accounts'].update({type: "account", email: account.email}, { $set: { 
				password: account.password,
				steam_acc: account.steam_acc,
				steam_pass: account.steam_pass,
				steam_shared_secret: account.steam_shared_secret
			}}, { multi: true }, function (err, numReplaced) {
				__db_err(err, __fili);

				if (numReplaced > 0) {
					callback(false, "Conta atualizada com sucesso");
				} else {
					callback(true, "Não foi possível atualizar os dados da conta");
				}
			});
		} else {
			callback(true, "Conta não encontrada");
		}
	});
};

Database.prototype.find_account = function(email, callback) {
	this.datastore['accounts'].find({type: "account", email: email}, function(err, result) {
		__db_err(err, __fili);
		callback(result);
	});
};

Database.prototype.get_all_accounts = function(callback) {
	this.datastore['accounts'].find({type: "account"}, function(err, result) {
		__db_err(err, __fili);
		callback(result);
	});
};


var DB = new Database();

module.exports = DB;