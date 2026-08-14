@echo off
title HVAS Server
cd /d "%~dp0"
node --env-file=.env deploy-keeper.mjs
