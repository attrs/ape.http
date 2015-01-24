var Listener = require('./Listener.js');
var Server = require('./Server.js');
var Bucket = require('./Bucket.js');

var buckets = {};

module.exports = {
	start: function(ctx) {
		var config = ctx.preference;
				
		var listeners = config.listeners || {};
		for( var k in config.listeners ) {
			var options = config.listeners[k];
			Listener.create(k, options);
		}
		
		for( var k in config.servers ) {
			var options = config.servers[k];
			var server = new Server(options);
			servers[k] = server;
		}
		
		return {
			Server: Server,
			Listener: Listener,
			Bucket: Bucket,
			create: function(name) {
				name = name || 'default';
				var bucketname = this.id + ':' + name;
				
				var bucket = new Bucket();
				bucket.mount = function(uri) {
					var server = Server.find(bucketname);
					if( !server ) return console.error('not found matchind server', bucketname);
					server.mount(uri, bucket);
					return this;
				};
				
				buckets[bucketname] = bucket;
				return bucket;			
			},
			drop: function(name) {
				name = name || 'default';
				var bucketname = this.id + ':' + name;
				
				var server = Server.find(bucketname);
				if( !server ) return console.error('not found matchind server', bucketname);
				server.unmount(buckets[bucketname]);
			},
			server: function(name, options) {
				if( arguments.length === 1 ) return Server.get(name);
				return Server.create(name, options);
			},
			servers: function() {
				return Server.all();				
			},
			listener: function(name) {
				return Listener.get(name);
			},
			listeners: function() {
				return Listener.all();
			}
		};
	},
	stop: function(ctx) {
		Listener.all().forEach(function(listener) {
			listener.stop();
		});
		
		console.log('[' + ctx.id + '] stopped');
	}
};

/*
		// in plugin
		var http = ctx.require('plexi.http');	
	
		var bucket = http.create('name');
		bucket.static('images', path.join(__dirname, 'www/images'));
		bucket.get('server', function(req, res, next) {
			res.send('ok.');
		});
		bucket.mount('/test');
		var server = bucket.server();
		var listener = server.listener();
		listener.stop().start();
*/