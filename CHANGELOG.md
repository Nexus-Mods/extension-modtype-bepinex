# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/) and this project adheres to [Semantic Versioning](http://semver.org/).

## [0.2.2] - 2023-12-04

- Fixed download issues caused by BIX package resolution applying the new archive format to 5.X.X versions of BepInEx

## [0.2.1] - 2023-12-04

- Fixed unsafe attempt to query the existence of the BepInEx package

## [0.2.0] - 2023-12-04

- Added version 5.4.22 to internal list
- Added ability to control the architecture (x86/x64/unix) of the BepInEx package when downloading from Github.
- Added ability to control the Unity Build type (mono/il2cpp)
- Added ability to define BepInEx configuration file from extension (or just include a pre-defined BepInEx.cfg file)
- Fixed BepInEx notification remaining open even after the package is installed or switching to a different game
- Fixed Github downloader resolving to incorrect asset
- Fixed various minor issues with the extension (type inference issues, removed unused code, improved overall readability, etc)
- Fixed Github downloader not kicking off when the required version cannot be found on Nexus Mods