var Listener = require('./Listener.js');
var Server = require('./Server.js');
var Bucket = require('./Bucket.js');
var path = require('path');
var fs = require('fs');
var wrench = require('wrench');
var util = require('attrs.util');

require('./filters/nodejs.js');

var buckets = {};

module.exports = {
	start: function(ctx) {
		var app = ctx.application;
		var pref = ctx.preference;
		
		// describe to default pref to plexi.json
		if( !pref ) {
			var docbase = path.resolve(process.cwd(), 'www');
			if( !fs.existsSync(docbase) ) {
				fs.mkdirSync(docbase);
				wrench.copyDirSyncRecursive(path.resolve(__dirname, '../www'), docbase, {
					forceDelete: true,
					preserveFiles: true
				});
			}
			
			pref = ctx.application.preferences.set('plexi.http', {
				servers: {
					'default': {
						docbase: 'www',
						mapping: '*',
						mount: {
							'bower_components': '/libs'
						}
					}
				}
			});
			ctx.application.preferences.save();
		}
						
		var listeners = pref.listeners || [];
		listeners.forEach(function(options) {
			Listener.create(options);
		});
		
		var servers = pref.servers;
		for( var k in servers ) {
			Server.create(k, servers[k]).listen();
		}
		
		this.exports = {
			Server: Server,
			Listener: Listener,
			Bucket: Bucket,
			create: function(name) {
				name = name || 'default';
				var id = this.id ? this.id + ':' + name : name;
				
				util.debug('plexi.http', 'bucket create', id);
				
				if( buckets[id] ) return util.error('plexi.http', 'already exists bucket name', name);
				
				var bucket = new Bucket(id);
				bucket.mountToAll = function(uri) {
					Server.mountToAll(uri, this);
					return this;
				};
				bucket.mount = function(uri) {
					Server.mount(uri);
					return this;
				};
				buckets[id] = bucket;
				return bucket;
			},
			mount: function(mount, bucket) {
				if( typeof mount === 'string' ) mount = {path: mount};
				
				if( !mount ) return util.error('plexi.http', 'illegal mount', this.id.toString(), mount);
				
				var bucketname = bucket.id || (this.id + ':' + (mount.name || 'default'));
				util.debug('plexi.http', 'bucket mount', bucketname, mount, '[from ' + this.id.toString() + ']');
				
				if( mount.all ) {
					Server.mountToAll(mount.path, bucket);
				} else if( mount.server ) {
					var server = Server.get(mount.server);
					if( !server ) return util.error('plexi.http', 'not found mount for ', this, mount);
					
					server.mount(mount.path, bucket);
				} else {
					Server.mount(bucketname, mount.path, bucket);
				}
				return this;
			},
			mountToAll: function(uri, bucket) {
				Server.mountToAll(uri, bucket);
				return this;
			},
			unmount: function(bucket) {
				return this;
			},
			drop: function(name) {
				name = name || 'default';
				var bucketname = this.id ? this.id + ':' + name : name;
				
				var bucket = buckets[bucketname];
				if( bucket ) {
					var servers = Server.finds(bucketname);
					if( servers ) {					
						servers.forEach(function(server) {
							server.unmount(bucket);
						});
					}
				}
				
				buckets[bucketname] = null;
				delete buckets[bucketname];
				return this;
			},
			server: function(name, options) {
				if( arguments.length === 1 ) return Server.get(name);
				return Server.create(name, options);
			},
			servers: function() {
				return Server.all();				
			},
			listener: function(port) {
				return Listener.get(port);
			},
			listeners: function() {
				return Listener.all();
			},
			filter: function(name, filter) {
				return Server.filter.apply(Server, arguments);
			},
			status: function() {
				return {};
			}
		};
	},
	stop: function(ctx) {
		Listener.all().forEach(function(listener) {
			listener.close();
		});
		
		console.log('[' + ctx.id + '] stopped');
	}
};
