var Server = require('../src/Server.js');
var Bucket = require('../src/Bucket.js');
var config = require('../plexi.json');
var options = config.preferences['plexi.http'];
var servers = options.servers || options;

for(var k in servers) {
	var o = servers[k];
	o.basedir = process.cwd();
	
	var server = new Server(o).listen();
	
	var bucket = new Bucket('test');
	bucket.get('/index.html', function(req, res, next) {
		res.send('bucket index.html');
	});
	
	server.mount('/test', bucket);
}
