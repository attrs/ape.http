var Server = require('../src/Server.js');
var Bucket = require('../src/Bucket.js');

var options = {
	"servers": {
		"default": {
			"port": 9090,
			"host": ["attrs.io", "*.attrs.io"],
			"docbase": {
				"common": "www",
				"iphone": "www/iphone",
				"ipad ios": "www/ios",
				"tablet": "www/tablet",
				"phone": "www/phone",
				"mobile": "www/mobile",
				"ie": "www/ie",
				"*": "www/web"
			},
			"session": {
				"type": "redis",
				"host": "127.0.0.1",
				"port": 6379
			},
			"bower": true,
			"logging": {
				"access": ":date - :method :status :url :remote-addr [:res[content-length] :referrer :user-agent :response-time ms]",
				"error": ":date - :method :status :url :remote-addr [:res[content-length] :referrer :user-agent :response-time ms]",
				"console": "error",
				"web": true
			},
			"statuspage": true,			
			"vhost": [
				{
					"host": "m.attrs.io",
					"docbase": {
						"common": "www",
						"iphone": "www/iphone",
						"phone": "www/phone",
						"*": "www/web"
					},
					"bower": true
				}, {
					"host": "joje.attrs.io",
					"docbase": "www/joje",
					"bower": false
				}, {
					"host": "admin.attrs.io",
					"forward": 9081
				}, {
					"host": "vhost3.dev",
					"forward": "http://daum.net"
				}
			],
			"mappings": {
				"pluginname": "m.attrs.io",
				"pluginname@version": "joje.attrs.io",
				"pluginname@version:bucketname": true,
				"*": true
			}
		},
		"workbench": {
			"port": 9081,
			"docbase": "www/workbench",
			"mappings": {
				"plexi.workbench": true
			}
		}
	}
};

var request = require('request');

describe('server test', function() {
	options.basedir = process.cwd();
	var server = new Server(options.servers.default);
	
	it("should respond with 200", function(done) {
		server.listen(function(err) {
			expect(err).toBeNotNull();
			done();
		});
	});
		
	it("should respond with 200", function(done) {
		request("http://127.0.0.1:9080/", function(error, response, body){
			console.log(response.status);
			expect(body).toEqual("hello world");
			done();
		});
	});
	
	it("서버종료되었는지 확인", function(done) {
		server.close();
		done();
	});
});
