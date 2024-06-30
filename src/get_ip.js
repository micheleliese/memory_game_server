const os = require('os');

module.exports = function getIP() {
  var ifaces = os.networkInterfaces();
	var ip = '';
	Object.keys(ifaces).forEach(function (ifname) {
		var alias = 0;
		ifaces[ifname].forEach(function (iface) {
			if ('IPv4' !== iface.family || iface.internal !== false) {
				return;
			}
			if (alias >= 1) {
				ip = `${ifname}: ${alias}, ${iface.address}`;
			} else {
				ip = `${ifname}: ${iface.address}`;
			}
			++alias;
		});
	});
	return ip;
}