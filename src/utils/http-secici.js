'use strict';

/**
 * Uç adresinin şemasına göre taşıyıcıyı seçer.
 *
 * Sağlayıcı çağrıları uzun süre yalnızca `https` modülüyle yapılıyordu; bu,
 * sağlayıcı her zaman uzak bir HTTPS ucu olduğu sürece sorun değildi. Abonelik
 * köprüsü bu varsayımı bozuyor: köprü makinenin kendi içinde, 127.0.0.1
 * üzerinde düz HTTP konuşur (TLS'in koruyacağı bir ağ yolu yok; erişim, köprünün
 * kendi anahtarıyla sınırlanır). Şema bakılmadığında istek
 * `Protocol "http:" not supported. Expected "https:"` ile düşüyordu.
 */

const http = require('http');
const https = require('https');

/** Adres düz HTTP ise http modülü, aksi hâlde https modülü. */
function istemciSec(adres) {
  return /^http:\/\//i.test(String(adres || '')) ? http : https;
}

module.exports = { istemciSec };
