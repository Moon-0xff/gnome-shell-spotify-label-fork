const St = imports.gi.St;
const Main = imports.ui.main;
const Soup = imports.gi.Soup;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Clutter = imports.gi.Clutter;
const PanelMenu = imports.ui.panelMenu;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const ByteArray = imports.byteArray;

//"User-defined" constants. If you've stumbled upon this extension, these values are the most likely you'd like to change.
const LEFT_PADDING = 30;
const RIGHT_PADDING = 30;
const MAX_STRING_LENGTH = 40;
const REFRESH_RATE = 1;
const EXTENSION_INDEX = 2;
const EXTENSION_PLACE = "left";

let _httpSession;

const SpotifyLabel = new Lang.Class({
	Name: 'SpotifyLabel',
	Extends: PanelMenu.Button,
	
	_init: function () {
		this.parent(0.0, "Spotify Label", false);
		
		this.buttonText = new St.Label({
			text: _("Loading..."),
			style: "padding-left: " + LEFT_PADDING + "px;"
			+ "padding-right: " + RIGHT_PADDING + "px; ",
			y_align: Clutter.ActorAlign.CENTER,
			x_align: Clutter.ActorAlign.FILL
		});
		
		// Create a new layout, add the text and add the actor to the layout
		let topBox = new St.BoxLayout();
		topBox.add(this.buttonText);
		this.actor.add_actor(topBox);
		
		//Place the actor/label at the "end" (rightmost) position within the left box
		children = Main.panel._leftBox.get_children();
		Main.panel._leftBox.insert_child_at_index(this.actor, children.length);
		
		this._refresh();
	},
	
	//Defind the refreshing function and set the timeout in seconds
	_refresh: function () {
		this._loadData(this._refreshUI);
		this._removeTimeout();
		this._timeout = Mainloop.timeout_add_seconds(REFRESH_RATE, Lang.bind(this, this._refresh));
		return true;
	},

	_loadData: function () {
		try{
			var labelstring = loadData();
			this._refreshUI(labelstring);
		}
		catch{
			this._refreshUI("");
		}
	},

	_refreshUI: function (data) {
		this.buttonText.set_text(data);
	},
	
	_removeTimeout: function () {
		if (this._timeout) {
			Mainloop.source_remove(this._timeout);
			this._timeout = null;
		}
	},
	
	stop: function () {
		if (_httpSession !== undefined)
		_httpSession.abort();
		_httpSession = undefined;
		
		if (this._timeout)
		Mainloop.source_remove(this._timeout);
		this._timeout = undefined;
		
		this.menu.removeAll();
	}
}
);

let spMenu;

function init() {
}

function enable() {
	spMenu = new SpotifyLabel;
	Main.panel.addToStatusArea('sp-indicator', spMenu, EXTENSION_INDEX, EXTENSION_PLACE);
}

function disable() {
	spMenu.stop();
	spMenu.destroy();
}

function dBusRequest (command) {
	let [res, out, err, status] = [];
	try {
		//Use GLib to send a dbus request with the expectation of receiving an MPRIS v2 response.
		[res, out, err, status] = GLib.spawn_command_line_sync(command);
	}
	catch(err) {
		global.log("spotifylabel: res: " + res + " -- status: " + status + " -- err:" + err);
		return "Error. Please check system logs.";
	}
	out = ByteArray.toString(out);
	return out;
}

function loadData(){
	var dBusList = dBusRequest("dbus-send --print-reply --dest=org.freedesktop.DBus  /org/freedesktop/DBus org.freedesktop.DBus.ListNames");
	var players = dBusList.match(/string \"org\.mpris\.MediaPlayer2.*(?=\"\n)/g);
	var metadata = dBusRequest("dbus-send --print-reply --dest=" + players[0].substring(8) + " /org/mpris/MediaPlayer2 org.freedesktop.DBus.Properties.Get string:org.mpris.MediaPlayer2.Player string:Metadata");
	var labelstring = parseMetadata(metadata);
	return labelstring
}

function parseMetadata(data) {
	if(!data)
		return ""

	var re = RegExp('string \".*(?=\"\n)');

	var titleBlock = data.substring(data.indexOf("xesam:title"));
	var title = titleBlock.match(re)[0].substring(8);

	var artistBlock = data.substring(data.indexOf("xesam:artist"));
	var artist = artistBlock.match(re)[0].substring(8);

	if (title.includes("xesam") || artist.includes("xesam"))
		return "Loading..."

	//Replaces every instance of " | "
	if(title.includes(" | "))
		title = title.replace(/ \| /g, " / ");

	if(artist.includes(" | "))
		artist = artist.replace(/ \| /g," / ");

	//If the name of either string is too long, cut off and add '...'
	if (artist.length > MAX_STRING_LENGTH){
		artist = artist.substring(0, MAX_STRING_LENGTH);
		artist = artist.substring(0, artist.lastIndexOf(" ")) + "...";
	}

	if (title.length > MAX_STRING_LENGTH){
		title = title.substring(0, MAX_STRING_LENGTH);
		title = title.substring(0, title.lastIndexOf(" ")) + "...";
	}
	return (title + " | " + artist);
}