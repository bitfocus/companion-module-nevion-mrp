var tcp = require('../../tcp');
var instance_skel = require('../../instance_skel');
var debug;
var log;

// Define Instance
function instance(system, id, config) {
	var self = this;

	// super-constructor
	instance_skel.apply(this, arguments);

	self.defineConst('STATE_IDLE', 1);
	self.defineConst('STATE_RECEIVING', 2);
	self.defineConst('STATE_WAITING', 3);

	return self;
}

// Update Config
instance.prototype.updateConfig = function(config) {
	var self = this;
	self.config = config;
	self.init_tcp();
	self.update_variables();
	self.init_feedback();
	self.checkFeedbacks();
	self.actions();
	self.init_presets();
};

// Init Instance
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
	self.data = {
		x: {},
		in: {},
		out: {},
		sspi: {},
		l: {}
	};

	self.selected     = 0;
	self.queue        = '';
	self.queuedDest   = -1;
	self.queuedSource = -1;

	self.status(1,'Connecting'); // status ok!
	self.init_tcp();
	self.actions_delayed(); 	// Export Actions
};

// Init TCP Conection
instance.prototype.init_tcp = function() {
	var self = this;

	debug('init tcp');

	if (self.socket !== undefined) {
		self.socket.destroy();
		delete self.socket;
	};

	self.state = self.STATE_IDLE;

	if (self.config.host) {

		self.socket = new tcp(self.config.host, self.config.port);

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
		me.update_variables(); 	// Export Variables
		me.init_feedback();			// Export Feedbacks
		me.checkFeedbacks();		// Export Feedbacks
		me.actions();						// Export Actions
		me.init_presets();			// Export Presets
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
		debug('inlist: ' + inlist[n]);
	}

}

// Entire output list
instance.prototype.nevion_read_outlist = function(msg) {

	var self = this;
	var outlist = msg.split("\n");

	outlist.shift();

	for (var n in outlist) {
		self.nevion_read_out(outlist[n]);
		debug('outlist: ' + outlist[n]);
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
			long_name: arr[4],
			desc: arr[5],
			unknown: arr[6]
		};

	}

	else {
		debog("out message not matchoutg '" + msg + "'");
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
			long_name: arr[4],
			desc: arr[5],
			unknown: arr[6]
		};

	}

	else {
		debug("in message not matching '" + msg + "'");
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
		debug("unknown login message", msg);
	}

}

// Entire X list for level
instance.prototype.nevion_read_s = function(msg) {

	var self = this;
	var xlist = msg.split("\n");

	xlist.shift();

	for (var n in xlist) {
		self.nevion_read_x(xlist[n]);
		debug('Xlist: ' + xlist[n]);
	}

}

// XPT
instance.prototype.nevion_read_x = function(msg) {
	var self = this;
	var arr = msg.split(/ /);
	var match;

	debug('data.x Level: %s Out: %s In: %s', arr[1], arr[3], arr[2]);

	// Video level
	if (self.data.x[arr[1]] === undefined) {
		self.data.x[arr[1]] = {};
	}

	// For the Video router:
	// { l1: {  '20':   '56' } }
	//   ^level ^output ^input

	// For button panels / Virtual interface:
	// { vtl1: {  '20':   '56' } }
	//   ^level    ^output ^input

	// Check if it's data for the router, not to fx a button interface (vtl XX)
	if (match = arr[1].match(/^l([0-9]+)/)) {
		self.data.x[arr[1]][arr[3]] = arr[2];

		// For the Video router:
		// { l1: {  '20':   '56' } }
		//   ^level ^output ^input

		if (self.data.in[arr[1]] !== undefined && self.data.in[arr[1]][arr[2]] !== undefined) {
			self.setVariable(arr[1] + '_output_' + arr[3] + '_input', self.data.in[arr[1]][arr[2]].name);
		}
		self.checkFeedbacks();
		self.checkFeedbacks(arr[1] + '_selected_source');
		self.checkFeedbacks(arr[1] + '_input_bg');
	}
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
			}
		}
	}

	else if (match = cmd.match(/^([a-z]+)/)) {
		if (match[1] !== undefined) {
			if (typeof self['nevion_read_' + match[1]] === "function") {
				self['nevion_read_' + match[1]](cmd);
			}
			else {
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
						debug("unknown",'"'+line+'"');
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
			id: 'port',
			label: 'Target Port (4381)',
			default: '4381',
			width: 4,
			regex: self.REGEX_PORT
		},
		{
			type: 'text',
			id: 'info',
			width: 12,
			label: 'Information',
			value: 'Options For configuring the funtionality of the module. This only affects (XY) mode.'
		},
		{
			type: 'checkbox',
			id: 'take',
			label: 'Enable Take?',
			width: 2,
			default: false,
		},
		{
			type: 'checkbox',
			id: 'show_input',
			label: 'Show Input on Destination?',
			width: 3,
			default: false,
		},
		// Not a thing you can add sadly, for providing the option for the user to define the BG color on all presets
	/*	{
			type: 'colorpicker',
			label: 'Destination Default BG color',
			id: 'dest_bg',
			width: 3,
			default: self.rgb(255,0,0) // Red
		},
		{
			type: 'colorpicker',
			label: 'Source Default BG color',
			id: 'source_bg',
			width: 3,
			default: self.rgb(0,204,0) // Green
		},*/
		{
			type: 'text',
			id: 'info',
			width: 12,
			label: 'Information',
			value: 'Please provide the necessary login credentials below.'
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

// Setup Actions
instance.prototype.actions = function(system) {
	var self = this;
	var actionlist = {};

	debug('init actions');

	var inlist = [];
	var outlist = [];

	for (var l in self.data.l) {
			
		for (var s in self.data.in[l]) {
			var dat = self.data.in[l][s];
			var num = parseInt(s);
			inlist[s] = { id: s, label: num + ': ' + dat.name }
		}

		for (var s in self.data.out[l]) {
			var dat = self.data.out[l][s];
			var num = parseInt(s);
			outlist[s] = { id: s, label: num + ': ' + dat.name }
		}

		actionlist['route_' + l] = {
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

		actionlist['select_destination_' + l] = {
			label: 'Select destination ' + l + ' ' + self.data.l[l].size + ' ' + self.data.l[l].desc,
			options: [
				{
					type: 'dropdown',
					label: 'Destination',
					id: 'destination',
					default: '0',
					choices: outlist
				}
			]
		};

		actionlist['route_source_' + l] = {
			label: 'Route source to selected destination '  + l + ' ' + self.data.l[l].size + ' ' + self.data.l[l].desc,
			options: [
				{
					type: 'dropdown',
					label: 'Source',
					id: 'source',
					default: '0',
					choices: inlist
				}
			]
		};

		actionlist['take_' + l]  = { 
			label: 'Take '  + l + ' ' + self.data.l[l].size + ' ' + self.data.l[l].desc 
		};

		actionlist['clear_' + l] = { 
			label: 'Clear '  + l + ' ' + self.data.l[l].size + ' ' + self.data.l[l].desc 
		};
	}

	self.system.emit('instance_actions', self.id, actionlist);
};

// Setup Action Logic
instance.prototype.action = function(action) {
	var self = this;
	var opt = action.options;
	var cmd = "";
	var level;

	var inlist = [];
	var outlist = [];

	for (var l in self.data.l) {

		for (var s in self.data.in[l]) {
			var dat = self.data.in[l][s];
			var num = parseInt(s);
			inlist[s] = { id: s, label: num + ': ' + dat.name }
		}

		for (var s in self.data.out[l]) {
			var dat = self.data.out[l][s];
			var num = parseInt(s);
			outlist[s] = { id: s, label: num + ': ' + dat.name }
		}
	
		switch (action.action) {
			case 'select_destination_'+l:
				self.selected = opt.destination;
				self.setVariable(l + '_selected_destination', outlist[self.selected].label);
				self.checkFeedbacks(l + '_selected_destination');
				self.checkFeedbacks(l + '_take_tally_source');
				self.checkFeedbacks(l + '_selected_source');
				debug('action: select_destination_'+l);
				debug('selected: ' + self.selected);
				break;

			case 'route_source_'+l:
				if (self.config.take === true) {
					self.queue = "x " + l + " " + opt.source + " " + self.selected;
					self.queuedDest = self.selected;
					self.queuedSource = opt.source;
					self.checkFeedbacks(l + '_take');
					self.checkFeedbacks(l + '_take_tally_source');
					self.checkFeedbacks(l + '_take_tally_dest');
					self.checkFeedbacks(l + '_take_tally_route');
					self.checkFeedbacks(l + '_input_bg');
					self.setVariable(l + '_selected_destination', outlist[self.queuedDest].label);
					self.setVariable(l + '_selected_source', inlist[self.queuedSource].label);
				}
				else {
					cmd = "x " + l + " " + opt.source + " " + self.selected;
				}
				debug(l + '_action: route_source_'+l);
				debug(l + '_selected: ' + self.selected);
				debug(l + '_que dest: ' + self.queuedDest);
				debug(l + '_que source: ' + self.queuedSource);
				break;
		

			case 'take_'+l:
				cmd = self.queue;
				self.queue = '';
				self.queuedDest = -1;
				self.queuedSource = -1;
				self.checkFeedbacks(l + '_take');
				self.checkFeedbacks(l + '_take_tally_source');
				self.checkFeedbacks(l + '_take_tally_dest');
				self.checkFeedbacks(l + '_take_tally_route');
				self.checkFeedbacks(l + '_input_bg');
				debug('action: take_'+l);
				break;
			
			case 'clear_'+l:
				self.queue = '';
				self.queuedDest = -1;
				self.queuedSource = -1;
				self.checkFeedbacks(l + '_take');
				self.checkFeedbacks(l + '_take_tally_source');
				self.checkFeedbacks(l + '_take_tally_dest');
				self.checkFeedbacks(l + '_take_tally_route');
				self.checkFeedbacks(l + '_input_bg');
				debug('action: clear_'+l);
				break;

			default:
				// Route
				if (level = action.action.match(/^route_(.+)$/)) {
					cmd = "x " + level[1] + " " + opt.source + " " + opt.destination;
					self.checkFeedbacks(l + '_take');
					self.checkFeedbacks(l + '_take_tally_source');
					self.checkFeedbacks(l + '_take_tally_dest');
					self.checkFeedbacks(l + '_take_tally_route');
					self.checkFeedbacks(l + '_input_bg');
					self.checkFeedbacks(l + '_selected_source');
					self.checkFeedbacks(l + '_selected_destination');
					debug('action: route_' + level[1] + ': ' + cmd);
				}		
				break;
			}
		}

	if (cmd !== "") {
		self.socket.send(cmd + "\n\n");
		debug('send: ' + cmd + "\n\n");
	}


};

// Setup Presets
instance.prototype.init_presets = function () {
	var self = this;
	var presets = [];

	debug('init preset');

	var inlist = [];
	var outlist = [];

	for (var l in self.data.l) {
			
		for (var s in self.data.in[l]) {
			var dat = self.data.in[l][s];
			var num = parseInt(s);
			inlist[s] = { id: s, label: num + ': ' + dat.name }
		}

		for (var s in self.data.out[l]) {
			var dat = self.data.out[l][s];
			var num = parseInt(s);
			outlist[s] = { id: s, label: num + ': ' + dat.name }
		}

		presets.push({
			category: l + ' Actions (XY only)',
			label: l + ' Take',
			bank: {
				style: 'text',
				text: l + ' Take',
				size: '18',
				color: self.rgb(255,255,255),
				bgcolor: self.rgb(0,0,0)
			},
			feedbacks: [
				{
					type: l + '_take',
					options: {
						bg: self.rgb(0,51,204),
						fg: self.rgb(255,255,255)
					}
				}
			],
			actions: [
				{
					action: 'take_' + l
				}
			]
		});

		presets.push({
			category: l + ' Actions (XY only)',
			label: l + ' Clear',
			bank: {
				style: 'text',
				text: l + ' Clear',
				size: '18',
				color: self.rgb(128,128,128),
				bgcolor: self.rgb(0,0,0)
			},
			feedbacks: [
				{
					type: l + '_take',
					options: {
						bg: self.rgb(0,0,0),
						fg: self.rgb(255,255,255)
					}
				}
			],
			actions: [
				{
					action: 'clear_' + l
				}
			]
		});

		for (var i in outlist) {
			if (self.config.show_input === true) {
				presets.push({
					category: l + ' Select Destination (X)',
					label: l + ' Selection destination button for ' + outlist[i].label,
					bank: {
						style: 'text',
						text: '$(nevion:' + l + '_output_' + i + ')' + '\\n' + '$(nevion:' + l + '_output_' + i + '_input)',
						size: '14',
						color: self.rgb(255,255,255),
						bgcolor: self.rgb(255,0,0)
//						bgcolor: self.config.dest_bg // Should be swaped with above line if color select becomes avalible in config settings
					},
					feedbacks: [
						{
							type: l + '_selected_destination',
							options: {
								bg: self.rgb(255,255,0),
								fg: self.rgb(0,0,0), 
								output: i
							}
						},
						{
							type: l + '_take_tally_dest',
							options: {
								bg: self.rgb(0,51,204),
								fg: self.rgb(255,255,255),
								output: i
							}
						}
					],
					actions: [
						{
							action: 'select_destination_' + l,
							options: {
								destination: i
							}
						}
					]
				});
			}
			else {
				presets.push({
					category: l + ' Select Destination (X)',
					label: l + ' Selection destination button for ' + outlist[i].label,
					bank: {
						style: 'text',
						text: '$(nevion:' + l + '_output_' + i + ')',
						size: '18',
						color: self.rgb(255,255,255),
						bgcolor: self.rgb(255,0,0)
//							bgcolor: self.config.dest_bg // Should be swaped with above line if color select becomes avalible in config settings
					},
					feedbacks: [
						{
							type: l + '_selected_destination',
							options: {
								bg: self.rgb(255,255,0),
								fg: self.rgb(0,0,0),
								output: i
							}
						},
						{
							type: l + '_take_tally_dest',
							options: {
								bg: self.rgb(0,51,204),
								fg: self.rgb(255,255,255),
								output: i
							}
						}
					],
					actions: [
						{
							action: 'select_destination_' + l,
							options: {
								destination: i
							}
						}
					]
				});
			}
		}

		for (var i in inlist) {
			presets.push({
				category: l + ' Route Source (Y)',
				label: l + ' Route ' + inlist[i].label + ' to selected destination',
				bank: {
					style: 'text',
					text: '$(nevion:' + l + '_input_' + i + ')',
					size: '18',
					color: self.rgb(255,255,255),
					bgcolor: self.rgb(0,204,0)
//					bgcolor: self.config.source_bg // Should be swaped with above line if color select becomes avalible in config settings
				},
				feedbacks: [
					{
						type: l + '_selected_source',
						options: {
							bg: self.rgb(255,255,255),
							fg: self.rgb(0,0,0),
							input: i
						}
					},
					{
						type: l + '_take_tally_source',
						options: {
							bg: self.rgb(0,51,204),
							fg: self.rgb(255,255,255),
							input: i
						}
					}
				],
				actions: [
					{
						action: 'route_source_' + l,
						options: {
							source: i
						}
					}
				]
			});
		}

		for (var o in outlist) {
			for (var i in inlist) {
				presets.push({
					category: l + ' Output ' + outlist[o].label,
					label: l + ' Output ' + outlist[o].label + ' button for ' + inlist[i].label,
					bank: {
						style: 'text',
						text: '$(nevion:' + l + '_input_' + i + ')',
						size: '18',
						color: self.rgb(255,255,255),
						bgcolor: self.rgb(0,0,0)
					},
					feedbacks: [
						{
							type: l + '_input_bg',
							options: {
								bg: self.rgb(255,255,0),
								fg: self.rgb(0,0,0),
								input: i,
								output: o
							}
						}
					],
					actions: [
						{
							action: 'route_' + l,
							options: {
								source: i,
								destination: o
							}
						}
					]
				});
			}
		}
	}

	self.setPresetDefinitions(presets);
};

// Setup Varibles
instance.prototype.update_variables = function (system) {
	var self = this;

	debug('init varibels');

	var variables = [];

	var inlist = [];
	var outlist = [];

	for (var l in self.data.l) {
			
		for (var s in self.data.in[l]) {
			var dat = self.data.in[l][s];
			var num = parseInt(s);
			inlist[s] = { id: s, label: dat.name }
		}

		for (var s in self.data.out[l]) {
			var dat = self.data.out[l][s];
			var num = parseInt(s);
			outlist[s] = { id: s, label: dat.name }
		}

		for (var i in inlist) {
				variables.push({
					label: 'Label of input ' + i,
					name: l + '_input_' + i
				});

				self.setVariable(l + '_input_' + i, inlist[i].label);
		}

		for (var i in outlist) {
			variables.push({
				label: 'Label of output ' + i,
				name: l + '_output_' + i
			});

			self.setVariable(l + '_output_' + i, outlist[i].label);

			variables.push({
				label: 'Label of input routed to output ' + i,
				name: l + '_output_' + i + '_input'
			});

			self.setVariable(l + '_output_' + i + '_input', inlist[self.data.x[l][i]].label);
		}

		variables.push({
			label: 'Label of selected destination',
			name: l + '_selected_destination'
		});

		variables.push({
			label: 'Label of input routed to selection',
			name: l + '_selected_source'
		});

		if (outlist[0] !== undefined) {
			self.setVariable(l + '_selected_destination', outlist[0].label);
		}
		if (inlist[0].label !== undefined) {
			self.setVariable(l + '_selected_source', inlist[0].label);
		}

		self.setVariableDefinitions(variables);
	}
}

// Setup Feedbacks
instance.prototype.init_feedback = function (system) {
	var self = this;

	debug('init feedback');

	var feedbacks = {};

	var inlist = [];
	var outlist = [];

	for (var l in self.data.l) {
			
		for (var s in self.data.in[l]) {
			var dat = self.data.in[l][s];
			var num = parseInt(s);
			inlist[s] = { id: s, label: num + ': ' + dat.name }
		}

		for (var s in self.data.out[l]) {
			var dat = self.data.out[l][s];
			var num = parseInt(s);
			outlist[s] = { id: s, label: num + ': ' + dat.name }
		}
	
		feedbacks[l + '_input_bg'] = {
			label: l + ' Change background color by destination',
			description: 'If the input specified is in use by the output specified, change background color of the bank',
			options: [
				{
					type: 'colorpicker',
					label: 'Foreground color',
					id: 'fg',
					default: self.rgb(0,0,0)
				},
				{
					type: 'colorpicker',
					label: 'Background color',
					id: 'bg',
					default: self.rgb(255,255,0)
				},
				{
					type: 'dropdown',
					label: 'Input',
					id: 'input',
					default: '0',
					choices: inlist
				},
				{
					type: 'dropdown',
					label: 'Output',
					id: 'output',
					default: '0',
					choices: outlist
				}
			],
		};

		feedbacks[ l + '_selected_destination'] = {
			label: l + ' Change background color by selected destination',
			description: 'If the output specified is selected, change background color of the bank',
			options: [
				{
					type: 'colorpicker',
					label: 'Foreground color',
					id: 'fg',
					default: self.rgb(0,0,0)
				},
				{
					type: 'colorpicker',
					label: 'Background color',
					id: 'bg',
					default: self.rgb(255,255,0)
				},
				{
					type: 'dropdown',
					label: 'Output',
					id: 'output',
					default: '0',
					choices: inlist
				}
			]
		};

		feedbacks[ l + '_selected_source'] = {
			label: l + ' Change background color by route to selected destination',
			description: 'If the input specified is in use by the selected output, change background color of the bank',
			options: [
				{
					type: 'colorpicker',
					label: 'Foreground color',
					id: 'fg',
					default: self.rgb(0,0,0)
				},
				{
					type: 'colorpicker',
					label: 'Background color',
					id: 'bg',
					default: self.rgb(255,255,255)
				},
				{
					type: 'dropdown',
					label: 'Input',
					id: 'input',
					default: '0',
					choices: inlist
				}
			]
		};

		feedbacks[ l + '_take'] = {
			label: l + ' Change background color if take has a route queued',
			description: 'If a route is queued for take, change background color of the bank',
			options: [
				{
					type: 'colorpicker',
					label: 'Foreground color',
					id: 'fg',
					default: self.rgb(255,255,255)

				},
				{
					type: 'colorpicker',
					label: 'Background color',
					id: 'bg',
					default: self.rgb(0,51,204)
				}
			]
		};

		feedbacks[ l + '_take_tally_source'] = {
			label: l + ' Change background color if the selected source is queued in take',
			description: 'If the selected source is queued for take, change background color of the bank',
			options: [
				{
					type: 'colorpicker',
					label: 'Foreground color',
					id: 'fg',
					default: self.rgb(255,255,255)

				},
				{
					type: 'colorpicker',
					label: 'Background color',
					id: 'bg',
					default: self.rgb(0,51,204)
				},
				{
					type: 'dropdown',
					label: 'Input',
					id: 'input',
					default: '0',
					choices: inlist
				}
			]
		};

		feedbacks[ l + '_take_tally_dest'] = {
			label: l + ' Change background color if the selected destination is queued in take',
			description: 'If the selected destination is queued for take, change background color of the bank',
			options: [
				{
					type: 'colorpicker',
					label: 'Foreground color',
					id: 'fg',
					default: self.rgb(255,255,255)

				},
				{
					type: 'colorpicker',
					label: 'Background color',
					id: 'bg',
					default: self.rgb(0,51,204)
				},
				{
					type: 'dropdown',
					label: 'Output',
					id: 'output',
					default: '0',
					choices: outlist
				}
			]
		};
	}

	self.setFeedbackDefinitions(feedbacks);
}

// Setup Feedback Logic
instance.prototype.feedback = function(feedback, bank) {
	var self = this;

	debug('update feedback');

	for (var l in self.data.l) {

		if (feedback.type == l + '_input_bg') {
			if (self.data.x[l][feedback.options.output] == parseInt(feedback.options.input)) {
				return {
					color: feedback.options.fg,
					bgcolor: feedback.options.bg
				};
			}
		}

		if (feedback.type == l + '_selected_destination') {
			if (parseInt(feedback.options.output) == self.selected) {
				return {
					color: feedback.options.fg,
					bgcolor: feedback.options.bg
				};
			}
		}

		else if (feedback.type == l + '_selected_source') {
			debug('FB_data.x: ' + self.data.x[l][self.selected]);
			debug('FB_input: ' + parseInt(feedback.options.input));
			if (self.data.x[l][self.selected] == parseInt(feedback.options.input)) {
				return {
					color: feedback.options.fg,
					bgcolor: feedback.options.bg
				};
			}
		}

		else if (feedback.type == l + '_take') {
			if (self.queue != '') {
				return {
					color: feedback.options.fg,
					bgcolor: feedback.options.bg
				};
			}
		}

		else if (feedback.type == l + '_take_tally_source') {
			if (parseInt(feedback.options.input) == self.queuedSource && self.selected == self.queuedDest) {
				return {
					color: feedback.options.fg,
					bgcolor: feedback.options.bg
				};
			}
		}

		else if (feedback.type == l + '_take_tally_dest') {
			if (parseInt(feedback.options.output) == self.queuedDest) {
				return {
					color: feedback.options.fg,
					bgcolor: feedback.options.bg
				};
			}
		}
	}
};

instance_skel.extendedBy(instance);
exports = module.exports = instance;
