---
title: メッシュ切断モジュール
role: Client Engineer
tech: Unity / C#
platform: None
description: メッシュを切断し剛体を増やすランタイムメッシュ編集機能
category: Other
tags: develop, tool
X: https://x.com/pankun2000_
thumbnail: assets/img/ogp.png
---

## 開発元 : PanKUN.dev

リリースの予定などはありません。  
技術研究の一環で作成しました。  

## 概要

カメラの中心でD&Dで切断する３D板を算出 (この板は描画されていません。)  
この板に沿ってメッシュを分割しGameObjectとしても分割、剛体も別々に動くようにして、切られたオブジェクトの動作を忠実に再現しました。  

ECS や GPGPU などプロジェクト要件に合わせた実装を行えば高速化、最適化の予知があります。  

## その他 SNS

[!X](https://x.com/pankun2000_/status/1773195103894409467?s=20)
