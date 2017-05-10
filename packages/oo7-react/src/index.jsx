import React from 'react';
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
