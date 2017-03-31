import React from 'react';
import TextField from 'material-ui/TextField';
import RaisedButton from 'material-ui/RaisedButton';
import {Bond, TimeBond, ReactiveBond, TransformBond} from 'oo7';

export class ReactiveComponent extends React.Component {
	constructor(reactiveProps = [], bonds = {}) {
		super();
		this.reactiveProps = reactiveProps;
		this.bonds = bonds;
		this.allBondKeys = [].concat(reactiveProps).concat(Object.keys(bonds));
	}
	componentWillMount() { this.initProps(); }
	componentWillReceiveProps(nextProps) { this.updateProps(nextProps); }
	componentWillUnmount() { this.finiProps(); }

	initProps () {
		this.manageProps({}, this.props);
		let that = this;
		let bonds = this.bonds;
		let bondKeys = Object.keys(bonds);
		this._consolidatedExtraBonds = new ReactiveBond(bondKeys.map(f => bonds[f]), [], a => {
			var s = that.state || {};
			bondKeys.forEach((f, i) => { s[f] = a[i]; });
			that.setState(s);
		}).use();
	}
	finiProps () {
		if (this._consolidatedExtraBonds) {
			this._consolidatedExtraBonds.drop();
			delete this._consolidatedExtraBonds;
		}
		if (this._consolidatedBonds) {
			this._consolidatedBonds.drop();
			delete this._consolidatedBonds;
		}
	}
	updateProps (nextProps) { this.manageProps(this.props, nextProps); }
	manageProps (props, nextProps) {
		var that = this;
		if (this._consolidatedBonds) {
			this._consolidatedBonds.drop();
			delete this._consolidatedBonds;
		}
		this._consolidatedBonds = new ReactiveBond(this.reactiveProps.map(f => nextProps[f]), [], a => {
			var s = that.state || {};
			that.reactiveProps.forEach((f, i) => { s[f] = a[i]; });
			that.setState(s);
		}).use();
	}

	ready() {
		return this.allBondKeys.every(k => this.state[k] !== undefined);
	}

	readyRender() {
		return this.unreadyRender();
	}

	unreadyRender() {
		return (<span />);
	}

	render() {
		return this.ready() ? this.readyRender() : this.unreadyRender();
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
			>{''+this.state.children}</span>
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
			>{''+this.state.children}</div>
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
			>{''+this.state.children}</a>
		);
	}
}

export class Rimg extends ReactiveComponent {
	constructor() {
		super(['src', 'className', 'style']);
	}
	render() {
		return (
			<img
				src={this.state.src}
				className={this.state.className}
				style={this.state.style}
				name={this.props.name}
			/>
		);
	}
}

export class RRaisedButton extends ReactiveComponent {
	constructor() {
		super(['disabled', 'label']);
	}
	render() {
		return (
			<RaisedButton
				disabled={this.state.disabled}
				label={this.state.label}
				onClick={this.props.onClick}
				name={this.props.name}
			/>
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
