# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/) and this project adheres to [Semantic Versioning](http://semver.org/).

## [0.2.0] - 2023-12-04

- Added ability to control the architecture (x86/x64/unix) of the BepInEx package when downloading from Github.
- Added ability to control the Unity Build type (mono/il2cpp)
- Added ability to define BepInEx configuration file from extension (or just include a pre-defined BepInEx.cfg file)
- Fixed Github downloader resolving to incorrect asset
- Fixed various minor issues with the extension (type inference issues, removed unused code, improved overall readability, etc)