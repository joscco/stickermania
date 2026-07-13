import {
  assetCacheDescriptor,
  isCacheableAssetPath,
  type AssetUrlCacheEnvironment,
} from "./asset-url-cache";

describe("asset-url-cache", () => {
  const environment: AssetUrlCacheEnvironment = {
    origin: "http://localhost:4200",
    hostname: "localhost",
  };

  it("skips virtual and inline asset URLs", () => {
    expect(assetCacheDescriptor("sprite:#sticker", environment)).toBeNull();
    expect(assetCacheDescriptor("data:image/png;base64,abc", environment)).toBeNull();
    expect(assetCacheDescriptor("blob:http://localhost:4200/abc", environment)).toBeNull();
  });

  it("skips non-cacheable paths", () => {
    expect(assetCacheDescriptor("/assets/sprite.svg", environment)).toBeNull();
    expect(isCacheableAssetPath("/assets/sprite.svg")).toBe(false);
  });

  it("canonicalizes relative asset URLs to the frontend origin", () => {
    expect(assetCacheDescriptor("/api/assets/sticker.png?version=1", environment)).toEqual({
      cacheKey: "http://localhost:4200/api/assets/sticker.png?version=1",
      requestUrl: "http://localhost:4200/api/assets/sticker.png?version=1",
    });
  });

  it("uses the dev proxy for localhost assets from another port", () => {
    expect(assetCacheDescriptor("http://localhost:3000/api/assets/sticker.png", environment)).toEqual({
      cacheKey: "http://localhost:4200/api/assets/sticker.png",
      requestUrl: "http://localhost:4200/api/assets/sticker.png",
    });
  });

  it("keeps remote request URLs while using a stable local cache key", () => {
    expect(assetCacheDescriptor("https://cdn.example.com/assets/png/avatar.png?x=1", environment)).toEqual({
      cacheKey: "http://localhost:4200/assets/png/avatar.png?x=1",
      requestUrl: "https://cdn.example.com/assets/png/avatar.png?x=1",
    });
  });

  it("requires an explicit browser-like environment for descriptor creation", () => {
    expect(assetCacheDescriptor("/api/assets/sticker.png", null)).toBeNull();
  });
});
