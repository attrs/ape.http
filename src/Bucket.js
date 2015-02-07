var express = require('express');
var fs = require('fs');
var path = require('path');
var minimatch = require('minimatch');
var util = require('./util.js');
var routers = require('./routers.js');

// class Bucket
function Bucket(id) {
	var docbase, filters = {}, debug = true, staticFirst;
	
	var router = function(req, res, next) {
		util.debug([req.app.get('server'), router], 'docbase(' + docbase + ')', req.url);
		
		docbaserouter(req, res, next);
		
		/*if( staticFirst ) {
			docbaserouter(req, res, function(err) {
				if( err ) return next(err);
				body(req, res, next);
			});
		} else {
			body(req, res, function(err) {
				if( err ) return next(err);
				docbaserouter(req, res, next);
			});
		}*/
	};
	
	var body = express.Router();
	var docbaserouter = routers.docbase({
		label: router,
		get debug() {
			return debug;
		},
		get docbase() {
			return docbase;
		},
		get router() {
			return body;
		},
		get staticFirst() {
			return staticFirst;
		},
		get filters() {
			return util.mix(require('./Server.js').filtermapping, filters);
		}
	});
	
	router.id = id;
	router.toString = function() {
		return 'router:' + (id || 'noname');
	};
	router.staticFirst = function(b) {
		staticFirst = b;
		return this;
	};
	router.docbase = function(doc) {
		docbase = doc;
		return this;
	};
	
	router.filter = function(pattern, fn) {
		if( arguments.length === 1 ) return this.options.filters && this.options.filters[pattern];
		
		if( typeof pattern !== 'string' ) return util.warn('illegal filter pattern', pattern);
		if( typeof fn !== 'function' ) return util.warn('illegal filter fn', fn);
		
		this.options.filters = this.options.filters || {};
		this.options.filters[pattern] = fn;
		
		return this;
	};
	
	
	router.use = function() {
		body.use.apply(body, arguments);
		return this;
	};
	
	router.all = function() {
		body.use.apply(body, arguments);
		return this;
	};
	
	router.get = function() {
		body.use.apply(body, arguments);
		return this;
	};
	
	router.post = function() {
		body.use.apply(body, arguments);
		return this;
	};
	
	router.put = function() {
		body.use.apply(body, arguments);
		return this;
	};
	
	router.del = function() {
		body.use.apply(body, arguments);
		return this;
	};
	
	router['delete'] = function() {
		body.use.apply(body, arguments);
		return this;
	};
	
	router.options = function() {
		body.use.apply(body, arguments);
		return this;
	};
	
	router.static = function(uri, file) {
		body.use(uri, express.static(file));
		return this;
	};
	
	router.remove = function(method, path) {
		if( method === 'all' ) method = '_all';
		body.stack.forEach(function(stack) {
			if( stack.path === path && stack.methods[method] ) {
				body.stack.splice(body.stack.indexOf(stack), 1);
			}
		});
		return this;
	};
	
	router.clear = function() {
		body.stack = [];
		return this;
	};
	
	return router;
};

module.exports = Bucket;