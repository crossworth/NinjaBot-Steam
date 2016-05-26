var socket = null;
var config = {
	logged: false,
};
var current_page = 0;
var prev_page = 0;
var _changing_page = false;
var update_time_interval = null;
var _steam_status = false;
var _interval_request_steam_guard_code = null;
var _interval_update_steam_guard_code_bar = null;
var _steam_guard_code_bar_value = 100;
var _showing_steam_guard_code_gen = false;

moment.locale("pt_br");

function guid() {
	function s4() {
		return Math.floor((1 + Math.random()) * 0x10000) .toString(16) .substring(1);
	}

	return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}

function htmlEncode(value){
  return $('<div/>').text(value).html();
}

function htmlDecode(value){
  return $('<div/>').html(value).text();
}

function ui_set_steam_status(status) {
	if (status == "online") {
		$("#steam_status_value").html('<i class="fa fa-check-circle" aria-hidden="true"></i>');
		$("#add_steam_acc_btn").hide();
		$("#add_steam_key_btn").show();
		$("#remove_steam_acc_btn").show();
		$("#check_games").show();
		_steam_status = true;
	} else if (status == "steamguard") {
		$("#gen_steamguard_code").hide();
		$("#add_steam_acc_btn").hide();
		$("#check_games").hide();
		$("#remove_steam_acc_btn").show();
		$("#steam_status_value").html('<i class="fa fa-mobile" aria-hidden="true"></i>');
		ui_set_new_itens(0);
		_steam_status = false;
	} else {
		$("#gen_steamguard_code").hide();
		$("#remove_steam_acc_btn").hide();
		$("#check_games").hide();
		$("#add_steam_key_btn").hide();
		$("#add_steam_acc_btn").show();
		$("#steam_status_value").html('<i class="fa fa-times-circle" aria-hidden="true"></i>');
		ui_set_new_itens(0);
		_steam_status = false;
	}
}

function ui_set_server_uptime(time) {
	time = moment.duration(time, 'seconds').humanize();
	$("#uptime_value").html(time);
}

function ui_set_steamguard_gen_value(value) {
	if (value < 30) {
		$("#code_counter_fill").css("background", "red");
	} else {
		$("#code_counter_fill").css("background", "#483d3d");
	}

	value = value + "%";
	$("#code_counter_fill").css("width", value);
}

function ui_set_new_update_time(time, seconds) {
	if (!seconds) {
		seconds = 600; // 10 minutes
	}

	clearInterval(update_time_interval);

	var cur_time = moment().unix();
	var w_time = cur_time - time - seconds;


	w_time = moment.duration(w_time, 'seconds').humanize();
	$("#new_update_time").html(w_time);

	// interval 
	var interval = 1 * 60 * 1000;

	update_time_interval = setInterval(function() {
		cur_time = moment().unix();
		var w_time = cur_time - time - seconds;

		w_time = moment.duration(w_time, 'seconds').humanize();
		$("#new_update_time").html(w_time);
	}, interval);

}

function ui_set_new_itens(number) {
	$("#new_itens_value").html(number);
}

function ui_add_log(date, message, id) {
	if (!id) {
		id = guid();
	}

	var new_log = "<tr id='" + id + "'><td width='170'>" + (new Date(date)).toLocaleString() + "</td><td class='message_log_area'>" + message + "</td> </tr>";
	if ($("#log_scroll tr").first().html() != $(new_log).html()) {
		$("#log_scroll").html(new_log + $("#log_scroll").html());
	}
}

function ui_clear_log() {
	$("#log_scroll").html("");
}

function ui_show_error(title, message) {
	$("#error_title").html(title);
	$("#error_message").html(message);

	$('[data-remodal-id=error_modal]').remodal().open();
}

function select_text(elem) {
	var range, selection;

	if (window.getSelection && document.createRange) {
        selection = window.getSelection();
        range = document.createRange();
        range.selectNodeContents(elem);
        selection.removeAllRanges();
        selection.addRange(range);
    } else if (document.selection && document.body.createTextRange) {
        range = document.body.createTextRange();
        range.moveToElementText(elem);
        range.select();
    }
}

function open_steamguard_code_gen() {

	socket.emit('steambot client steamguard generate code', {});

	_interval_request_steam_guard_code = setInterval(function() {
		socket.emit('steambot client steamguard generate code', {});
	}, 5 * 1000);

	_interval_update_steam_guard_code_bar = setInterval(function () {
		if (_showing_steam_guard_code_gen) {
			ui_set_steamguard_gen_value(_steam_guard_code_bar_value);
		}

		if (_steam_guard_code_bar_value > 0) {
			_steam_guard_code_bar_value = _steam_guard_code_bar_value - 3.3;
		}
	}, 1000);

	$('[data-remodal-id=steamguard_code_gen]').remodal().open();
	_showing_steam_guard_code_gen = true;
}

function close_steamguard_code_gen() {
	clearInterval(_interval_request_steam_guard_code);
	_showing_steam_guard_code_gen = false;

	setTimeout(function() {
		$("#code_wrap").hide();
	}, 400);
}

function check_games() {
	socket.emit('steambot client check games', {});	
}

function show_page(page) {
	if (_changing_page) {
		return;
	}
	_changing_page = true;

	var pages = [];
	pages.push('loading'); // 0
	pages.push('login'); // 1
	pages.push('log'); // 2
	pages.push('server_off'); // 3
	pages.push('register'); // 4

	$("#" + pages[current_page]).fadeOut(400, function() {
		$("#" + pages[page]).fadeIn();
		prev_page = current_page;
		current_page = page;
		_changing_page = false;
	});
}

function socket_connect() {
	socket = null;

	var socket_address = "http://steam.pedrohenrique.ninja:3132";

	if (location.href.indexOf('localhost') != -1) {
		socket_address = "http://localhost:3132";
	}

	socket = io.connect(socket_address, {
		forceNew: true
	});

	socket.on('steambot full log', function(payload) {
		var data = payload.data;

		var log_size = data.length;

		if (log_size > 100) {
			log_size = 100;
		}

		var log_html = "";

		for(var i = 0; i < log_size; i++) {
			var new_log = "<tr id='" + data[i].id_sort + "'><td width='170'>" + (new Date(data[i].date)).toLocaleString() + "</td><td class='message_log_area'>" + data[i].message + "</td> </tr>";
			log_html = log_html + new_log;
		} // for

		$("#log_scroll").html(log_html);
	});

	socket.on('steambot new steamguard code generated', function(payload) {
		$("#code_wrap").show();
		var code = payload.code;

		if ($("#code_big").html() != code) {
			_steam_guard_code_bar_value = 100;
		}

		$("#code_big").html(code);
	});

	socket.on('steambot new log', function(payload) {
		ui_add_log(payload.date, payload.log);
	});

	socket.on('steambot uptime', function(payload) {
		ui_set_server_uptime(payload.uptime);
	});

	socket.on('steambot last check', function(payload) {
		ui_set_new_update_time(payload.time, payload.seconds);
	});

	socket.on('steambot steam status', function(payload) {
		ui_set_steam_status(payload.status);
	});

	socket.on('steambot steam new itens', function(payload) {
		ui_set_new_itens(payload.number);
	});

	socket.on('steambot steam steamguard', function(payload) {
		ui_set_steam_status("steamguard");

		$('[data-remodal-id=steamguard_steam_account]').remodal().open();
	});

	socket.on('steambot steam steamguard shared_secret enable', function(payload) {
		$("#gen_steamguard_code").show();
	});

	socket.on('error', function (error_message){
		if (error_message == "Email já em uso") {
			ui_show_error("Registrar novo usuário", "Email já em uso");
			if (current_page != 4) {
				show_page(4);
			}
		} 

		if (!$.cookie('register') && error_message == "Not authorized") {
			if (current_page == 1) {
				ui_show_error("Login", "Ops, seu email ou senha estão incorretos");
			} else {
				show_page(1);
			}
		}  

		console.log('socket on error', error_message);
		$.removeCookie('register');
	});

	socket.on('connect_error', function (payload){
		if (current_page != 3) {
			show_page(3);
		}
	});

	socket.on('connect', function (message){
		ui_clear_log();

		socket.emit('steambot client email', {email: $.cookie('email')});

		show_page(2);

		if ($.cookie('register') == 'true') {
			$.removeCookie('register');
			$.cookie('login', true);
		}
	});

	socket.on('steambot steam game keys', function(result) {
		var keys = result.keys;
		var apps_owned = result.apps_owned;

		$("#keys_table").html("");

		var button_atrr = "";
		var button_text = "Adicionar na minha conta Steam";

		if (_steam_status == false) {
			button_atrr = "disabled";
			button_text = "Você não está logado na Steam";
		} else {
			button_atrr = "";
		}

		for(var i = 0; i < keys.length; i++) {
			var game_name = htmlDecode(keys[i].game);

			if (apps_owned.indexOf(game_name) != - 1) {
				button_text = "Você já possui este jogo";
				button_atrr = "disabled";
			}

			var key_td = "<tr><td width='100'>" + keys[i].code + "</td><td width='100'>" + keys[i].from_steam_login + "</td><td width='100'>" + game_name + "</td><td><button class='uk-button uk-button-small uk-button-primary' onclick=\"add_key_from_list('" + keys[i].code + "', this, '" + keys[i].from_steam_login + "');\" " + button_atrr + ">" + button_text +"</button></td></tr>";
			$("#keys_table").html(key_td + $("#keys_table").html());
		}

		setTimeout(function() {
			$('[data-remodal-id=steambot_keys_not_used]').remodal().open();
		}, 100);
	});


}

socket_connect();

function add_key_from_list(key, elem, from_user) {
	$(elem).parent().parent().remove();
	socket.emit('steambot client add steam game', {code: key, user: from_user});

}

function remove_steam_acc() {
	socket.emit('steambot client remove steam account', {});
}

function add_key_on_steam() {
	var code = $("#steam_key").val();

	if (code) {
		$("#steam_key").val("");
		socket.emit('steambot client add steam game', {code: code});
	} else {
		setTimeout(function() {
			ui_show_error('Ops', 'Você não informou o código do jogo');
		}, 400);
	}
}

function do_login() {
	$.removeCookie('register');

	var email = $("#email_login").val();
	var password = $("#password_login").val();

	if (!!email && !!password) {
		$("#email_login").val("");
		$("#password_login").val("");

		$.cookie('email', email, { expires: 365 });
		$.cookie('password', btoa(password), { expires: 365 });
		$.cookie('login', true, { expires: 365 });

		socket_connect();
	} 

}

function show_keys() {
	socket.emit('steambot client get steam game keys', {});
}

function do_logout() {
	$.removeCookie('login');
	$.cookie('email');
	$.cookie('password');
	show_page(1);
}


function do_register() {
	$.removeCookie('login');

	var email = $("#email_register").val();
	var password = $("#password_register").val();

	if (!!email && !!password) {
		$("#email_login").val("");
		$("#password_login").val("");

		$.cookie('email', email);
		$.cookie('password', btoa(password));
		$.cookie('register', true);

		socket_connect();
	} 

}

function add_steam_acc() {
	var login = $("#steam_acc_login").val();
	var password = $("#steam_acc_password").val();
	var shared_secret = $("#steam_acc_shared_secret").val();

	if (login && password) {
		console.log(shared_secret);
		socket.emit('steambot client add steam account', { login: login, password: password, shared_secret: shared_secret});

		$("#steam_acc_login").val("");
		$("#steam_acc_password").val("");

	} else {
		setTimeout(function() {
			ui_show_error('Ops', 'Você deve informar o login e a senha da sua conta Steam');
		}, 400);
	}
}

function send_steamguard() {
	var code = $("#steam_steamguard").val();

	if (code) {
		$("#steam_steamguard").val("");
		socket.emit('steambot client steamguard', { code: code });

	} else {
		setTimeout(function() {
			ui_show_error('Ops', 'Você não informou o código do SteamGuard');
		}, 400);
	}

}
