module.exports = class MCP4725{
	constructor(addr, comm, config){
		if(typeof config != 'object') config = {};
		this.config = Object.assign({
			//write EEPROM on every transmission
			persist: false,

			//Set eeprom with default startup settings
			startup: false,

			//Start-up settings
			//Power Down mode.
			//0=Normal mode,
			//1=1K Resistor to Ground,
			//2=100k "",
			//3=500k ""
			eeprom_pd: 0,
			eeprom_dac: 2048
		}, config);
		if(this.config.persist) this.config.startup = false; 
		this.comm = comm;
		this.addr = addr;
		this.initialized = false;
		this.status = {};
		this.init();
	}
	dac2bytes(i){
		return [i >> 4, (i & 15) << 4];
	}
	init(){
		this.get().then((status) => {
			if(!this.config.startup){
				this.initialized = true;
				return;
			}
			if(status.eeprom_pd != this.config.eeprom_pd || status.eeprom_dac != this.config.eeprom_dac){
				this.set(this.config.eeprom_dac, true, this.config.eeprom_pd).then(() => {
					this.initialized = true;
				}).catch((err) => {
					console.log(err);
					this.initialized = false;
				})
			}
		}).catch((err) => {
			console.log(err);
			this.initialized = false;
		})
	}
	parseStatus(r){
		this.status = {
			pd: (r[0] >> 1) & 3,
			dac: (r[1] << 4) | (r[2] >> 4),
			eeprom_pd: (r[3] >> 5) & 3,
			eeprom_dac: ((r[3] & 15) << 8) & r[4]
		}
		return this.status;
	}
	get(){
		return new Promise((fulfill, reject) => {
			this.comm.readBytes(this.addr, 6).then((r) => {
				this.initialized = true;
				fulfill(this.parseStatus(r));
			}).catch((err) => {
				this.initialized = false;
				reject(err);
			});
		});
	}
	set(dac, eeprom, pd){
		return new Promise((fulfill, reject) => {
			if(!pd) pd = 0;
			var reg = (eeprom || this.config.persist ? 96 : 64) | (pd << 1);
			var bytes = this.dac2bytes(dac);
			this.comm.writeBytes(this.addr, reg, ...bytes).then(() => {
				this.initialized = true;
				fulfill(dac);
			}).catch((err) => {
				this.initialized = false;
				reject(err);
			});
		});
	}
}
