import React from 'react';
import TextField from 'material-ui/TextField';
import {Bond, TimeBond, TransformBond} from 'oo7';

export class ReactiveComponent extends React.Component {
	constructor(reactiveProps = [], extraState = {}) {
		super();
		this.reactiveProps = reactiveProps;
		this.extraState = extraState;
	}
	componentWillMount() { this.initProps(); }
	componentWillReceiveProps(nextProps) { this.updateProps(nextProps); }

	initProps () {
		this.manageProps({}, this.props);
		let that = this;
		Object.keys(this.extraState).forEach(f => {
			if (this.extraState[f] instanceof Bond)
				this.extraState[f].subscribe(a => {
					var s = that.state || {};
					s[f] = a;
//					console.log(`Setting state via subscription: ${f} => ${a}`);
					that.setState(s);
				});
			else if (this.extraState[f] instanceof Promise)
				this.extraState[f].then(a => {
					var s = that.state || {};
					s[f] = a;
//					console.log(`Setting state via subscription: ${f} => ${a}`);
					that.setState(s);
				});
			else {
				if (s === {})
					s = that.state || {};
				s[f] = this.extraState[f];
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

				if (nextProps[f] instanceof Bond)
					nextProps[f].subscribe(a => {
						var s = that.state || {};
						s[f] = a;
//						console.log(`Setting state via subscription: ${f} => ${a}`);
						that.setState(s);
					});
				else if (nextProps[f] instanceof Promise)
					nextProps[f].then(a => {
						var s = that.state || {};
						s[f] = a;
//						console.log(`Setting state via subscription: ${f} => ${a}`);
						that.setState(s);
					});
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

export class Reactive extends ReactiveComponent {
    constructor() { super(['value', 'className']); }

	render() {
        let className = typeof(this.state.className) === 'function' ?
            this.state.className(this.state.value) :
            typeof(this.state.className) === 'string' ?
            this.state.className :
            '';
        let undefClassName = this.props.undefClassName === null ? '_undefined' : this.props.undefClassName;
        let undefContent = this.props.undefContent === null ? '?' : this.props.undefContent;
		if (this.state.value === null || typeof(this.state.value) == 'undefined')
			return (<span className={undefClassName}>{undefContent}</span>);
        let a = this.props.transform ? this.props.transform(this.state.value) : this.state.value;
		return <span className={className}>{a}</span>;
	}
}

export class ReactiveAnchor extends ReactiveComponent {
	constructor() {
		super(['href', 'className', 'style', 'children']);
	}
	render() {
		return <a
				href={this.state.href}
				className={this.state.className}
				style={this.state.style}
				id={this.props.id}
				name={this.props.name}
				target={this.props.target}
			>{this.state.children}</a>;
	}
}

export class BondedTextField extends React.Component {
	constructor() {
		super();
		this.state = { value: '' };
	}

	render() {
		return (<TextField
			className={this.props.className}
			style={this.props.style}
			id={this.props.id}
			name={this.props.name}
			value={this.state.value}
			floatingLabelText={this.props.floatingLabelText}
			errorText={this.props.errorText || (typeof(this.props.validator) === 'function' && !this.props.validator(this.state.value) ? this.props.invalidText : null)}
			onChange={(e, v) => {
				this.setState({value: v});
				if (this.props.bond instanceof Bond && (typeof(this.props.validator) !== 'function' || this.props.validator(v)))
					this.props.bond.changed(v);
			}}
		/>);
	}
}
BondedTextField.defaultProps = {
	invalidText: 'Invalid'
};
