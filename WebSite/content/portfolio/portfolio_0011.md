---
title: GPGPU物理演算(XPBD) + 自作描画
role: Client Engineer
tech: Unity / C# / ShaderLab　/ hlml
platform: Unity
description:  コンピュートシェーダーで物理演算によるオブジェクトのTransform計算から描画までをGPUで完結させてリバック０回のゲームオブジェクトの実装
category: Plugin
tags: develop, game, module
X: https://x.com/pankun2000_
thumbnail: assets/img/ogp.png
---

## 開発元 : PanKUN.dev

リリースの予定などはありません。  
技術研究の一環で作成しました。  

## 概要

3桁万の剛体オブジェクトを扱うゲームを作成できるようにするために作成したモジュールです。

インクリメントゲームやインフレゲームで新しい領域として"扱うゲームロジック関与オブジェクトの母数を圧倒的に増やす"のを目的として実装しました。

## 経緯

昨今海外の何人かの技術開発者が大量の数百万のオブジェクトに対して一つづつ攻撃やインタラクト可能な実装をしている投稿が増えました。

そう言われてみればゲームで一フレームにオブジェクトの数が数百万表示されたり座標が変わったりするゲームって過去なかった気がする...？

と思い立ったのが始まりです。

## その他 SNS

[!X](https://x.com/pankun2000_/status/2093394096668987783)
