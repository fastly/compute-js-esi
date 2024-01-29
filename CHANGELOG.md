# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [unreleased]

## [0.1.3] - 2024-01-29

### Added
- XmlDocument can be constructed with an empty parameter list to default to empty namespaces definitions
- EsiTransformer now throws if an unknown tag in esi: namespace is seen
- EsiTransformStream can be constructed with alternate (or no) default namespace prefix
- ESI Transform pipes unknown XML tags and attributes through
- refactor: Use 'attr' instead of 'prop' terminology in internal API for XML attributes

### Fixed

- docs: recommend setting `host_override` instead of `host` header

## [0.1.2] - 2024-01-16

### Fixed

- Fixed regex for literal string to allow for empty string

## [0.1.1] - 2024-01-16

### Fixed

- Dictionaries with missing values will return empty strings

## [0.1.0] - 2023-12-19

### Added

- Initial public release

[unreleased]: https://github.com/fastly/compute-js-esi/compare/v0.1.3...HEAD
[0.1.3]: https://github.com/fastly/compute-js-esi/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/fastly/compute-js-esi/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/fastly/compute-js-esi/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/fastly/compute-js-esi/releases/tag/v0.1.0
