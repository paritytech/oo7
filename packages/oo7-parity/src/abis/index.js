// (C) Copyright 2016-2017 Parity Technologies (UK) Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//         http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

const ParityApi = require('@parity/api');

const sha3 = ParityApi.util.sha3;

const RegistryABI = require('./registry.json');
const RegistryExtras = [
	{ name: 'lookupData', method: 'getData', args: [n => sha3(n.toLowerCase()), null] },
	{ name: 'lookupAddress', method: 'getAddress', args: [n => sha3(n.toLowerCase()), null] },
	{ name: 'lookupUint', method: 'getUint', args: [n => sha3(n.toLowerCase()), null] },
	{ name: 'lookupOwner', method: 'getOwner', args: [n => sha3(n.toLowerCase())] }
];
const GitHubHintABI = require('./githubhint.json');
const OperationsABI = require('./operations.json');
const BadgeRegABI = require('./badgereg.json');
const TokenRegABI = require('./tokenreg.json');
const BadgeABI = require('./badge.json');
const TokenABI = require('./token.json');

// Deprecated.
function abiPolyfill () {
	return {
		registry: RegistryABI,
		registryExtras: RegistryExtras,
		githubhint: GitHubHintABI,
		operations: OperationsABI,
		badgereg: BadgeRegABI,
		tokenreg: TokenRegABI,
		badge: BadgeABI,
		erc20token: TokenABI
	};
}

module.exports = { abiPolyfill, RegistryABI, RegistryExtras, GitHubHintABI, OperationsABI, BadgeRegABI,
	TokenRegABI, BadgeABI, TokenABI};
