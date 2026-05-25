#!/bin/bash
keytool -genkey -v -keystore ~/chainmail-release.keystore -alias chainmail -keyalg RSA -keysize 2048 -validity 10000
