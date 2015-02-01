var Listener = require('./Listener.js');
var Server = require('./Server.js');
var Bucket = require('./Bucket.js');
var path = require('path');

var buckets = {};

module.exports = {
	start: function(ctx) {
		var config = ctx.preference;
				
		var listeners = config.listeners || [];
		listeners.forEach(function(options) {
			Listener.create(options);
		});
		
		var systemserver = Server.create('system', {
			docbase: path.resolve(__dirname, '../www'),
			port: 19000
		}).listen();
		
		var servers = config.servers;		
		for( var k in servers ) {
			Server.create(k, servers[k]).listen();
		}
		
		// create system workbench
		process.nextTick(function() {
			var wb = ctx.require('plexi.workbench');
			var workbench = wb.create('system', {
				title: 'System Workbench',
				docbase: path.resolve(__dirname, '../workbench'),
				pages: [
					{
						id: 'welcome',
						type: 'html',
						title: 'Welcome',
						icon: 'book',
						src: 'pages/welcome.html'
					}, {
						id: 'overview',
						type: 'views',
						title: 'System Overview',
						icon: 'dashboard',
						views: [
							{
								region: 'center',
								title: 'Framework',
								icon: 'database',
								src: 'welcome.html'
							}
						]
					}, {
						id: 'plugins',
						type: 'views',
						title: 'Plugins',
						icon: 'git-branch',
						views: [
							{
								region: 'center',
								title: 'Plugins',
								src: 'pages/welcome.html'
							}
						]
					}, {
						id: 'http',
						type: 'views',
						title: 'HTTP Service',
						icon: 'git-branch',
						views: [
							{
								region: 'center',
								title: 'Plugins',
								src: 'pages/welcome.html'
							}
						]
					}
				]
			});
			
			systemserver.mount('/', workbench.bucket);
		});		
		
		return {
			Server: Server,
			Listener: Listener,
			Bucket: Bucket,
			systemserver: systemserver,
			create: function(name) {
				name = name || 'default';
				var bucketname = this.id ? this.id + ':' + name : name;
				
				if( buckets[bucketname] ) return console.error('already exists bucket name', bucketname);
				
				var bucket = new Bucket();
				bucket.mountToAll = function(uri) {
					if( !uri ) return console.error('invalid uri', uri);
					
					var servers = Server.all();
					if( servers ) {
						servers.forEach(function(server) {
							server.mount(uri, bucket);
						});
					}
					return this;
				};
				bucket.mount = function(uri, tosystem) {
					if( !uri ) return console.error('invalid uri', uri);
					
					var servers = Server.finds(bucketname);
					if( servers ) {
						servers.forEach(function(server) {
							server.mount(uri, bucket);						
						});
					}
					
					if( tosystem !== false ) systemserver.mount('/buckets/' + bucketname, this);
					return this;
				};
				bucket.name = bucketname;
				
				buckets[bucketname] = bucket;
				return bucket;
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
					systemserver.unmount(bucket);
				}
				
				buckets[bucketname] = null;
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