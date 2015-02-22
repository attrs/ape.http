var path = require('path');
var fs = require('fs');

module.exports = function(req, res, next) {
	res.set('Content-Type', 'application/json');
	res.send({
		test: 1
	});	
};