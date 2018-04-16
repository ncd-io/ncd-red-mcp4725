"use strict";

const MCP4725 = require("./index.js");

process.on('unhandledRejection', error => {
  console.log('unhandledRejection', error);
});


module.exports = function(RED){
	var sensor_pool = {};
	var loaded = [];

	//ensureDependencies(['node-red-contrib-aws', 'fail']);

	function NcdI2cDeviceNode(config){
		RED.nodes.createNode(this, config);
		this.interval = parseInt(config.interval);
		this.addr = parseInt(config.addr);
		if(typeof sensor_pool[this.id] != 'undefined'){
			//Redeployment
			clearTimeout(sensor_pool[this.id].timeout);
			delete(sensor_pool[this.id]);
		}

		this.sensor = new MCP4725(this.addr, RED.nodes.getNode(config.connection).i2c, config);
		sensor_pool[this.id] = {
			sensor: this.sensor,
			polling: false,
			timeout: 0,
			node: this
		}

		var node = this;

		function device_status(){
			if(!node.sensor.initialized){
				node.status({fill:"red",shape:"ring",text:"disconnected"});
				return false;
			}
			node.status({fill:"green",shape:"dot",text:"connected"});
			return true;
		}

		function start_poll(force){
			if(node.interval && !sensor_pool[node.id].polling){
				stop_poll();
				sensor_pool[node.id].polling = true;
				get_status(true, force);
			}
		}

		function stop_poll(){
			clearTimeout(sensor_pool[node.id].timeout);
			sensor_pool[node.id].polling = false;
		}
		var last_status = false;
		function send_payload(status, force){
			if(last_status == status.dac) return;
			last_status = status.dac;
			var msg = {topic: 'device_status', payload: status.dac, settings: status};
			node.send(msg);
		}

		function get_status(repeat, force){
			if(repeat) clearTimeout(sensor_pool[node.id].timeout);
			if(device_status(node)){
				node.sensor.get().then((res) => {
					send_payload(res, force);
				}).catch((err) => {
					node.send({error: err});
				}).then(() => {
					if(repeat && node.interval){
						clearTimeout(sensor_pool[node.id].timeout);
						sensor_pool[node.id].timeout = setTimeout(() => {
							if(typeof sensor_pool[node.id] != 'undefined'){
								get_status(true);
							}
						}, node.interval);
					}else{
						sensor_pool[node.id].polling = false;
					}
				});
			}else{
				clearTimeout(sensor_pool[node.id].timeout);
				node.sensor.init();
				sensor_pool[node.id].timeout = setTimeout(() => {
					if(typeof sensor_pool[node.id] != 'undefined'){
						get_status(true);
					}
				}, 3000);
			}
		}

		node.on('input', (msg) => {
			stop_poll();
			if(msg.topic != 'get_status'){
				if(typeof msg.payload == 'object'){
					if(typeof msg.dac != 'undefined'){
						var args = [
							msg.dac,
							typeof msg.dac != 'undefined' ? msg.eeprom : false,
							typeof msg.pd != 'undefined' ? msg.pd : false
						]
						node.sensor.set(...args).then().catch().then(() => {
							start_poll()
						});
					}
				}else{
					node.sensor.set(msg.payload).then().catch().then(() => {
						start_poll()
					});
				}
			}else{
				start_poll(true);
			}
		});

		node.on('close', (removed, done) => {
			if(removed){
				clearTimeout(sensor_pool[node.id].timeout);
				delete(sensor_pool[node.id]);
			}
			done();
		});

		start_poll();
		device_status(node);
	}
	RED.nodes.registerType("ncd-mcp4725", NcdI2cDeviceNode)
}
