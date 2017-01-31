import React from 'react';
import TextField from 'material-ui/TextField';
import {Bond, TimeBond, TransformBond} from 'oo7';

export class ReactiveComponent extends React.Component {
	constructor(reactiveProps = [], bonds = {}) {
		super();
		this.reactiveProps = reactiveProps;
		this.bonds = bonds;
	}
	componentWillMount() { this.initProps(); }
	componentWillReceiveProps(nextProps) { this.updateProps(nextProps); }

	initProps () {
		this.manageProps({}, this.props);
		let that = this;
		Object.keys(this.bonds).forEach(f => {
			if (this.bonds[f] instanceof Bond)
				this.bonds[f].subscribe(a => {
					var s = that.state || {};
					s[f] = a;
//					console.log(`Setting state via subscription: ${f} => ${a}`);
					that.setState(s);
				});
			else if (this.bonds[f] instanceof Promise)
				this.bonds[f].then(a => {
					var s = that.state || {};
					s[f] = a;
//					console.log(`Setting state via subscription: ${f} => ${a}`);
					that.setState(s);
				});
			else {
				if (s === {})
					s = that.state || {};
				s[f] = this.bonds[f];
			}
		})
	}
	updateProps (nextProps) { this.manageProps(this.props, nextProps); }
	manageProps (props, nextProps) {
		var s = {};
		var that = this;
		this.reactiveProps.forEach(f => {
//			console.log(`managing field ${f}`);
			if (nextProps[f] !== props[f]) {
				if (props[f] instanceof Bond)
					props[f].drop();

				let update = a => {
					var s = that.state || {};
					s[f] = a;
//					console.log(`Setting state via subscription: ${f} => ${a}`);
					that.setState(s);
				};
				if (nextProps[f] instanceof Bond)
					nextProps[f].subscribe(update);
				else if (nextProps[f] instanceof Promise)
					nextProps[f].then(update);
				else {
					if (s === {})
						s = this.state || {};
					s[f] = nextProps[f];
				}
			}
		});
		if (s !== {})
			this.setState(s);
	}
}

export class Rspan extends ReactiveComponent {
    constructor() { super(['className', 'style', 'children']); }
	render() {
		return (
			<span
				className={this.state.className}
				style={this.state.style}
				name={this.props.name}
			>{this.state.children}</span>
		);
	}
}

export class Rdiv extends ReactiveComponent {
    constructor() { super(['className', 'style', 'children']); }
	render() {
		return (
			<div
				className={this.state.className}
				style={this.state.style}
				name={this.props.name}
			>{this.state.children}</div>
		);
	}
}

export class Ra extends ReactiveComponent {
	constructor() {
		super(['href', 'target', 'className', 'style', 'children']);
	}
	render() {
		return (
			<a
				href={this.state.href}
				target={this.state.target}
				className={this.state.className}
				style={this.state.style}
				name={this.props.name}
			>{this.state.children}</a>
		);
	}
}

export class Hash extends ReactiveComponent {
	constructor() {
		super(['value', 'className', 'style']);
	}
	render() {
		let v = this.state.value;
		let d = typeof(v) === 'string' && v.startsWith('0x') && v.length >= 18
			? v.substr(0, 8) + '…' + v.substr(v.length - 4)
			: v;
		return (
			<span
				className={this.state.className}
				style={this.state.style}
				title={this.state.value}
				name={this.props.name}
			>{d}</span>
		);
	}
}
Hash.defaultProps = {
	className: '_hash'
};

export class TextBond extends React.Component {
	constructor() {
		super();
		this.state = { value: '' };
	}

	fixValue(v) {
		if (this.props.bond instanceof Bond && (typeof(this.props.validator) !== 'function' || this.props.validator(v)))
			this.props.bond.changed(v);
		else
			this.props.bond.reset();
	}

	componentWillMount() { this.fixValue(this.state.value); }

	render() {
		return (
			<TextField
				className={this.props.className}
				style={this.props.style}
				name={this.props.name}
				value={this.state.value}
				floatingLabelText={this.props.floatingLabelText}
				errorText={this.props.errorText || (typeof(this.props.validator) === 'function' && !this.props.validator(this.state.value) ? this.props.invalidText : null)}
				onChange={(e, v) => {
					this.setState({value: v});
					this.fixValue(v);
				}}
			/>
		);
	}
}
TextBond.defaultProps = {
	invalidText: 'Invalid'
};

export class HashBond extends TextBond {}
HashBond.defaultProps = {
	floatingLabelText: 'Enter a hash to look up',
	invalidText: 'Invalid 32-byte hash',
	validator: v => v.startsWith('0x') && v.length == 66
};

export class URLBond extends TextBond {}
URLBond.defaultProps = {
	floatingLabelText: 'Enter a URL',
	invalidText: 'Not a URL',
	validator: u => { try { return new URL(u) && true; } catch (e) { return false; } }
}
