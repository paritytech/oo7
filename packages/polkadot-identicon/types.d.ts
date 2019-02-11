import React from 'react';

export type IdenticonProps = {
	className?: string,
	account: string | Uint8Array,
	sixPoint?: boolean,
	size: number,
	style?: { [index: string]: any }
};

export default class Identicon extends React.Component<IdenticonProps, {}> {
}
