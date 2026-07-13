import {Directive, ElementRef, input, effect} from "@angular/core";
import {cachedAssetUrl} from "./asset-url-cache";

@Directive({
  selector: "img[appCachedSrc]",
  standalone: true,
})
export class CachedSrcDirective {
  readonly appCachedSrc = input.required<string | null>();

  private generation = 0;

  constructor(private readonly elementRef: ElementRef<HTMLImageElement>) {
    effect(() => {
      const imageUrl = this.appCachedSrc();
      const generation = ++this.generation;
      if (!imageUrl) {
        this.elementRef.nativeElement.removeAttribute("src");
        return;
      }

      void cachedAssetUrl(imageUrl).then((resolvedUrl) => {
        if (generation !== this.generation) return;
        this.elementRef.nativeElement.src = resolvedUrl;
      });
    });
  }
}
