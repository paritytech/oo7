const React = require('react')
const {ReactiveComponent} = require('oo7-react')
const {ss58Decode, ss58Encode} = require('oo7-substrate')
const {blake2b} = require('blakejs')

const zero = blake2b(new Uint8Array([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]))

const copyToClipboard = str => {
	const el = document.createElement('textarea');
	el.value = str;
	document.body.appendChild(el);
	el.select();
	document.execCommand('copy');
	document.body.removeChild(el);
};
 
export default class Identicon extends ReactiveComponent {
	constructor () {
		super(["account"])
	}
	render () {
		let s = 64
		let c = s / 2
		let r = this.props.sixPoint ? s / 2 / 8 * 5 : (s / 2 / 4 * 3)
		let rroot3o2 = r * Math.sqrt(3) / 2
		let ro2 = r / 2
		let rroot3o4 = r * Math.sqrt(3) / 4
		let ro4 = r / 4
		let r3o4 = r * 3 / 4
	
		let z = s / 64 * 5
		let schema = {
			target: { freq: 1, colors: [0, 28, 0, 0, 28, 0, 0, 28, 0, 0, 28, 0, 0, 28, 0, 0, 28, 0, 1] },
			cube: { freq: 20, colors: [0, 1, 3, 2, 4, 3, 0, 1, 3, 2, 4, 3, 0, 1, 3, 2, 4, 3, 5] },
			quazar: { freq: 16, colors: [1, 2, 3, 1, 2, 4, 5, 5, 4, 1, 2, 3, 1, 2, 4, 5, 5, 4, 0] },
			flower: { freq: 32, colors: [0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 3] },
			cyclic: { freq: 32, colors: [0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 6] },
			vmirror: { freq: 128, colors: [0, 1, 2, 3, 4, 5, 3, 4, 2, 0, 1, 6, 7, 8, 9, 7, 8, 6, 10] },
			hmirror: { freq: 128, colors: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 8, 6, 7, 5, 3, 4, 2, 11] }
		}

		let total = Object.keys(schema).map(k => schema[k].freq).reduce((a, b) => a + b)
		let findScheme = d => {
			let cum = 0
			let ks = Object.keys(schema)
			for (let i in ks) {
				let n = schema[ks[i]].freq
				cum += n;
				if (d < cum) {
					return schema[ks[i]]
				}
			}
			throw "Impossible"
		}
		
		let id = typeof this.state.account == 'string' ? ss58Decode(this.state.account) : this.state.account
		if (!(typeof id == 'object' && id && id instanceof Uint8Array && id.length == 32)) {
			return <svg
				id={this.props.id}
				name={this.props.name}
				className={this.props.className}
				style={this.props.style}
				width={this.props.width || this.props.size}
				height={this.props.height || this.props.size}
				viewBox='0 0 64 64'
			/>
		}
		let ss58 = ss58Encode(id);
		id = Array.from(blake2b(id)).map((x, i) => (x + 256 - zero[i]) % 256)

		let sat = (Math.floor(id[29] * 70 / 256 + 26) % 80) + 30
		let d = Math.floor((id[30] + id[31] * 256) % total)
		let scheme = findScheme(d)
		let palette = Array.from(id).map((x, i) => {
			let b = (x + i % 28 * 58) % 256
			if (b == 0) {
				return '#444'
			}
			if (b == 255) {
				return 'transparent'
			}
			let h = Math.floor(b % 64 * 360 / 64)
			let l = [53, 15, 35, 75][Math.floor(b / 64)]
			return `hsl(${h}, ${sat}%, ${l}%)`
		})

		let rot = (id[28] % 6) * 3

		let colors = scheme.colors.map((_, i) => palette[scheme.colors[i < 18 ? (i + rot) % 18 : 18]])

		let i = 0;
		return (<svg
			id={this.props.id}
			name={this.props.name}
			className={this.props.className}
			style={this.props.style}
			width={this.props.width || this.props.size}
			height={this.props.height || this.props.size}
			viewBox='0 0 64 64'
			onClick={() => { copyToClipboard(ss58); this.props.onCopied && this.props.onCopied(ss58); }}
		>
			<circle cx={s / 2} cy={s / 2} r={s / 2} fill="#eee"/>
			<circle cx={c} cy={c - r} r={z} fill={colors[i++]}/>
			<circle cx={c} cy={c - ro2} r={z} fill={colors[i++]}/>
			<circle cx={c - rroot3o4} cy={c - r3o4} r={z} fill={colors[i++]}/>
			<circle cx={c - rroot3o2} cy={c - ro2} r={z} fill={colors[i++]}/>
			<circle cx={c - rroot3o4} cy={c - ro4} r={z} fill={colors[i++]}/>
			<circle cx={c - rroot3o2} cy={c} r={z} fill={colors[i++]}/>
			<circle cx={c - rroot3o2} cy={c + ro2} r={z} fill={colors[i++]}/>
			<circle cx={c - rroot3o4} cy={c + ro4} r={z} fill={colors[i++]}/>
			<circle cx={c - rroot3o4} cy={c + r3o4} r={z} fill={colors[i++]}/>
			<circle cx={c} cy={c + r} r={z} fill={colors[i++]}/>
			<circle cx={c} cy={c + ro2} r={z} fill={colors[i++]}/>
			<circle cx={c + rroot3o4} cy={c + r3o4} r={z} fill={colors[i++]}/>
			<circle cx={c + rroot3o2} cy={c + ro2} r={z} fill={colors[i++]}/>
			<circle cx={c + rroot3o4} cy={c + ro4} r={z} fill={colors[i++]}/>
			<circle cx={c + rroot3o2} cy={c} r={z} fill={colors[i++]}/>
			<circle cx={c + rroot3o2} cy={c - ro2} r={z} fill={colors[i++]}/>
			<circle cx={c + rroot3o4} cy={c - ro4} r={z} fill={colors[i++]}/>
			<circle cx={c + rroot3o4} cy={c - r3o4} r={z} fill={colors[i++]}/>
			<circle cx={c} cy={c} r={z} fill={colors[i++]}/>
		</svg>)
	}
}
