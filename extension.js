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

function parseMetadata(metadata) {
	if(!metadata)
		return ""
	
	var title = parseMetadataField(metadata,"xesam:title");
	var artist = parseMetadataField(metadata,"xesam:artist");
	var album = parseMetadataField(metadata,"xesam:album");

	if( (title || artist || album) == "")
		return ""

	var labelstring = (artist + " | " + album + " | " + title);

	return labelstring
}

function parseMetadataField(metadata,fieldText) {
	var re = RegExp('string \".*(?=\"\n)');

	var dataBlock = metadata.substring(metadata.indexOf(fieldText));
	var data = dataBlock.match(re)[0].substring(8);
	
	if (data.includes("xesam:") || data.includes("mpris:"))
		return ""
	
	//Replaces every instance of " | "
	if(data.includes(" | "))
		data = data.replace(/ \| /g, " / ");

	//If the name of either string is too long, cut off and add '...'
	if (data.length > MAX_STRING_LENGTH){
		data = data.substring(0, MAX_STRING_LENGTH);
		data = data.substring(0, data.lastIndexOf(" ")) + "...";
	}

	if(data.match(/Remaster/i))
		data = removeRemasterText(data);

	return data
}

function removeRemasterText(datastring) {
	var matchedSubString = datastring.match(/\((.*?)\)/gi); //matches text between parentheses

	if (!matchedSubString)
		matchedSubString = datastring.match(/-(.*?)$/gi); //matches text between a hyphen(-) and the end of the string

	if (!matchedSubString)
		return datastring //returns <datastring> unaltered if both matches were not successful

	if(!matchedSubString[0].match(/Remaster/i))
		return datastring //returns <datastring> unaltered if our match doesn't contain 'remaster'

	datastring = datastring.replace(matchedSubString[0],"");

	if (datastring.charAt(datastring.length-1) == " ")
		datastring = datastring.substring(0,datastring.length-1); 

	return datastring
}