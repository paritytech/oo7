let _metadata = null;

function setMetadata(m) {
    _metadata = m
}

function metadata() {
    return _metadata
}

module.exports = { metadata, setMetadata }