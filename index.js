/*jslint node: true */
var es = require('event-stream');

function createWait(done, start) {
	var num = 0;
	start = start || false;
	return function (handle, _start) {
		start = _start;
		num++;
		handle(function () {

			if ((--num) === 0 && start) {

				done();
			}
		});
	}
}

function onString(file, callback) {
	if (file.isBuffer()) {
		callback(String(file.contents));
	}
	else if (file.isStream) {
		var bufs = [];
		file.contents.on('data', function (d) {
			bufs.push(d);
		});
		file.contents.on('end', function () {
			callback(String(Buffer.concat(bufs)));
		});
	}
	else {
		callback("");
	}
}

module.exports = {
	toKissyJs: function (nameGetter) {
		return this.replace({patterns: [
			{
				match: /^[^$]+$/,
				replacer: function (file) {
					return function (content) {
						return 'KISSY.add("' + nameGetter(file) + '",function(){return ' + content + '});'
					}
				}
			}
		]})
	},
	toKissyCss: function (nameGetter) {
		return this.replace({patterns: [
			{
				match: /^[^$]+$/,
				replacer: function (file) {
					return function (content) {
						return 'KISSY.add("' + nameGetter(file) + '",function(S,D){return D.addStyleSheet((' + content + ')()) || null},{requires:["dom"]});'
					}
				}
			}
		]})
	},
	prependPipe: function (replacer, spliter) {
		return this.replace({patterns: [
			{
				match: /^/,
				replacement: spliter || ""
			},
			{
				match: /^/,
				replacer: replacer
			}
		]});
	},
	appendPipe: function (replacer, spliter) {
		return this.replace({patterns: [
			{
				match: /$/,
				replacement: spliter || ""
			},
			{
				match: /$/,
				replacer: replacer
			}
		]});
	},
	replace: function (option) {
		return es.map(function (file, callback) {
			var patterns = {},
				contents,
				wait = createWait(function () {
					for (var key in patterns) {
						var pattern = patterns[key];
						contents = contents.replace(pattern.match, pattern.replacement);
					}
					file.contents = new Buffer(contents);
					callback(null, file);
				});

			wait(function (callback) {
				onString(file, function (str) {
					contents = str;
					callback();
				});
			});

			function prepare(_pattern, pattern) {
				pattern.match = _pattern.match;
				pattern.replacement = _pattern.replacement;
				if (_pattern.replacer) {
					pattern.replacement = _pattern.replacer(file);
				}
				if (!pattern.replacement) {
					return;
				}
				var replacement = pattern.replacement;
				if (replacement.pipe) {
					wait(function (callback) {
						replacement.pipe(es.map(function (file, _callback) {
							onString(file, function (str) {
								_callback(null, file);
								pattern.replacement = function () {
									return str
								};
								callback();
							});
						}));
					});
				}
			}

			for (var key in option.patterns) {
				prepare(option.patterns[key], patterns[key] = {});
			}
			wait(function (callback) {
				callback();
			}, true);
		});
	}
}