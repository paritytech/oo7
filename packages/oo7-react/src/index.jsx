import {Bond, TimeBond, TransformBond} from 'oo7';
import React from 'react';

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
