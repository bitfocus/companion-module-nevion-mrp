var tcp = require('../../tcp');
var instance_skel = require('../../instance_skel');
var debug;
var log;

function instance(system, id, config) {
	var self = this;

	// super-constructor
	instance_skel.apply(this, arguments);

	self.defineConst('STATE_IDLE', 1);
	self.defineConst('STATE_RECEIVING', 2);
	self.defineConst('STATE_WAITING', 3);

	return self;
}

instance.prototype.updateConfig = function(config) {
	var self = this;
	self.updateDropD()
	self.config = config;
	self.init_tcp();
	self.actions();
};

instance.prototype.updateDropD = function() {
	var self = this;


};

instance.prototype.init = function() {
	var self = this;
	debug = self.debug;
	log = self.log;
	self.message_command = [];
	self.message_queue = [];
	self.first = true;
	self.actionstimer = undefined;
	self.login = false;
	self.delta = "";
	self.data = {};
	self.status(1,'Connecting'); // status ok!
	self.updateDropD()
	self.init_tcp();
	self.actions_delayed(); // export actions
};

instance.prototype.init_tcp = function() {
	var self = this;

	if (self.socket !== undefined) {
		self.socket.destroy();
		delete self.socket;
	};

	self.state = self.STATE_IDLE;

	if (self.config.host) {

		self.socket = new tcp(self.config.host, 4381);

		self.socket.on('status_change', function (status, message) {
			self.status(status, message);
		});

		self.socket.on('error', function (err) {
			debug("Network error", err);
			self.status(self.STATE_ERROR, err);
			self.log('error',"Network error: " + err.message);
		});

		self.socket.on('connect', function () {

			self.status(self.STATE_OK);

			self.data = {
				x: {},
				in: {},
				out: {},
				sspi: {},
				l: {}
			};

			self.delta = "";

			debug("Connected");

			self.socket.send("llist\n\n")

		})

		self.socket.on('data', function (data) {

			var ds = self.delta + data.toString();

			self.delta = "";
			var ic = ds.split(/\n/);

			if (!ds.match(/\n$/)) {
				self.delta = ic.pop();
			}

			for (var n in ic) {
				self.message_queue.push(ic[n]);
			}

			self.process_message_queue();
		});

	}
};


// A function for throttling the number of action updates.
instance.prototype.actions_delayed = function() {
	var self = this;

	if (self.actionstimer !== undefined) {
		clearTimeout(self.actionstimer);
	}

	self.actionstimer = setTimeout(function(me) {
		me.actions();
	}, 50, self);

};

// Nevion commands, and how to store/read/use them

// Entire input list
instance.prototype.nevion_read_inlist = function(msg) {

	var self = this;
	var inlist = msg.split("\n");

	inlist.shift();

	for (var n in inlist) {
		self.nevion_read_in(inlist[n]);
	}

}

// Entire output list
instance.prototype.nevion_read_outlist = function(msg) {

	var self = this;
	var outlist = msg.split("\n");

	outlist.shift();

	for (var n in outlist) {
		self.nevion_read_out(outlist[n]);
	}

}

// Level list
instance.prototype.nevion_read_llist = function(msg) {

	var self = this;
	var llist = msg.split("\n");

	llist.shift();

	for (var n in llist) {
		var l = llist[n].split(/ /);
		var level = l.shift();
		var size = l.shift();
		var type = l.shift();
		var desc = l.join(" ");
		self.data.l[level] = {
			'size': size,
			'type': type,
			'desc': desc
		}
		self.socket.send("inlist " + level + "\n\n" );
		self.socket.send("outlist " + level + "\n\n" );
		self.socket.send("s " + level + "\n\n" );
	}

	// Update actionlist with new info
	self.actions_delayed();

}

// Output update
instance.prototype.nevion_read_out = function(msg) {

	var self = this;
	var arr;

	if (arr = msg.match(/^out ([^ ]+) ([0-9]+) "([^"]*)" "([^"]*)" "([^"]*)" "([^"]*)"/)) {

		if (self.data.out[arr[1]] === undefined) {
			self.data.out[arr[1]] = {};
		}

		self.data.out[arr[1]][arr[2]] = {
			name: arr[3],
			unknown_1: arr[4],
			desc: arr[5],
			unknown_2: arr[6]
		};

	}

	else {
		console.log("out message not matchoutg '" + msg + "'");
	}

	// Update actionlist with new info
	self.actions_delayed();

}

// Input update
instance.prototype.nevion_read_in = function(msg) {
	var self = this;
	var arr;

	if (arr = msg.match(/^in ([^ ]+) ([0-9]+) "([^"]*)" "([^"]*)" "([^"]*)" "([^"]*)"/)) {

		if (self.data.in[arr[1]] === undefined) {
			self.data.in[arr[1]] = {};
		}

		self.data.in[arr[1]][arr[2]] = {
			name: arr[3],
			unknown_1: arr[4],
			desc: arr[5],
			unknown_2: arr[6]
		};

	}

	else {
		console.log("in message not matching '" + msg + "'");
	}

	// Update actionlist with new info
	self.actions_delayed();

}

// SSPI - Input signal state (present/missing?)
instance.prototype.nevion_read_sspi = function(msg) {

	var self = this;
	var arr = msg.split(/ /);

	// Video level
	if (self.data.sspi[arr[1]] === undefined) {
		self.data.sspi[arr[1]] = {};
	}

	// { l1: {  '20':   'p' } }
	//   ^level ^input  ^presence

	self.data.sspi[arr[1]][arr[2]] = arr[3];

}

// Login
instance.prototype.nevion_read_login = function(msg) {

	var self = this;

	if (msg == '? "login"') {
		if (self.config.user !== "" && self.config.pass !== "") {
			debug("trying to log in");
			self.socket.send("login " + self.config.user + " " + self.config.pass + "\n\n" );
		}
		else {
			debug("not logging in, no user/pass provided. staying anonymous");
		}
	}

	// Good enough.
	else if (msg.match('login.+failed')) {
		debug("login failed, staying anonymous.");
	}

	else if (msg.match('login.+ok')) {
		debug('login ok');
	}

	else {
		console.log("unknown login message", msg);
	}

}


// Entire X list for level
instance.prototype.nevion_read_s = function(msg) {

	var self = this;
	var xlist = msg.split("\n");

	xlist.shift();

	for (var n in xlist) {
		self.nevion_read_x(xlist[n]);
	}

}

// XPT
instance.prototype.nevion_read_x = function(msg) {

	var self = this;
	var arr = msg.split(/ /);

	// Video level
	if (self.data.x[arr[1]] === undefined) {
		self.data.x[arr[1]] = {};
	}

	// { l1: {  '20':   '56' } }
	//   ^level ^output ^input

	self.data.x[arr[1]][arr[3]] = arr[2];

}

// Messages from the router is dynamically assigned to functions above.
// The functions are prefixed with "nevion_command_"

instance.prototype.process_nevion_message = function() {

	var self = this;
	var cmd = self.message_command.trim();

	var match;

	if (match = cmd.match(/\? "([a-z]+)/)) {
		if (match[1] !== undefined) {
			if (typeof self['nevion_read_' + match[1]] === "function") {
				self['nevion_read_' + match[1]](cmd);
			}
			else {
				console.log("nevion missing function:",match[1]);
			}
		}
	}

	else if (match = cmd.match(/^([a-z]+)/)) {
		if (match[1] !== undefined) {
			if (typeof self['nevion_read_' + match[1]] === "function") {
				self['nevion_read_' + match[1]](cmd);
			}
			else {
				console.log("nevion missing function:",match[1]);
			}
		}
	}

	else {
		debug("ugh",cmd);
	}

};

instance.prototype.process_message_queue = function() {

	var self = this;

	// go through the message queue until its empty
	while(self.message_queue.length > 0) {

		var oline = self.message_queue;
		var line = oline.shift();

		if (self.state === self.STATE_RECEIVING) {
			if (line == '') {
				self.process_nevion_message();
				self.message_command = "";
				self.state = self.STATE_IDLE;
			}
			else {
				self.message_command = self.message_command + line + "\n";
			}
		}

		else {

			if (line == "%") {
				self.state = self.STATE_RECEIVING;
			}

			else {

				if (line !== "") {

					if (line.match(/^\? "/)) {
						self.state = self.STATE_RECEIVING;
						self.message_command = line + "\n";
					}
					else {
						console.log("unknown",'"'+line+'"');
					}
				}

			}

		}

	}

};

// Return config fields for web config
instance.prototype.config_fields = function () {
	var self = this;

	return [
		{
			type: 'textinput',
			id: 'host',
			label: 'Target IP',
			width: 4,
			regex: self.REGEX_IP
		},
		{
			type: 'textinput',
			id: 'user',
			label: 'Username',
			width: 4,
		},
		{
			type: 'textinput',
			id: 'pass',
			label: 'Password',
			width: 4,
		}
	];

};

// When module gets deleted
instance.prototype.destroy = function() {
	var self = this;

	if (self.socket !== undefined) {
		self.socket.destroy();
	}

	debug("destroy", self.id);;
};




instance.prototype.actions = function(system) {
	var self = this;

	var actionlist = {};
	for (var l in self.data.l) {
		var inlist = [];
		var outlist = [];

		for (var s in self.data.in[l]) {
			var dat = self.data.in[l][s];
			var num = parseInt(s) + 1;
			inlist[s] = { id: s, label: num + ': ' + dat.name }
		}

		for (var s in self.data.out[l]) {
			var dat = self.data.out[l][s];
			var num = parseInt(s) + 1;
			outlist[s] = { id: s, label: num + ': ' + dat.name }
		}

		actionlist['route_'+l] = {

			label: 'Route ' + l + ' ' + self.data.l[l].size + ' ' + self.data.l[l].desc,

			options: [
				{
					type: 'dropdown',
					label: 'Source',
					id: 'source',
					default: '0',
					choices: inlist
				},
				{
					type: 'dropdown',
					label: 'Destination',
					id: 'destination',
					default: '0',
					choices: outlist
				}
			]

		};

	}

	self.system.emit('instance_actions', self.id, actionlist);
};


instance.prototype.action = function(action) {
	var self = this;
	var opt = action.options
	var cmd = "";
	var level;

	// Route
	if (level = action.action.match(/^route_(.+)$/)) {
		cmd = "x " + level[1] + " " + action.options.source + " " + action.options.destination;
	}


	if (cmd !== "") {
		self.socket.send(cmd + "\n\n");
	}
};

instance_skel.extendedBy(instance);
exports = module.exports = instance;
