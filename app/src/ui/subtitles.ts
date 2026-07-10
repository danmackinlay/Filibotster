const TAIL_CHARS = 280

export class Subtitles {
  private finalTail = ''
  private interim = ''
  private el: HTMLElement

  constructor(container: HTMLElement) {
    this.el = container.querySelector<HTMLElement>('.sub-line') ?? container
  }

  addFinal(text: string): void {
    this.finalTail = `${this.finalTail} ${text}`.trimStart()
    if (this.finalTail.length > TAIL_CHARS) {
      const cut = this.finalTail.length - TAIL_CHARS
      const space = this.finalTail.indexOf(' ', cut)
      this.finalTail = this.finalTail.slice(space >= 0 ? space + 1 : cut)
    }
    this.interim = ''
    this.render()
  }

  setInterim(text: string): void {
    this.interim = text
    this.render()
  }

  clear(): void {
    this.finalTail = ''
    this.interim = ''
    this.render()
  }

  private render(): void {
    this.el.textContent = ''
    const fin = document.createElement('span')
    fin.className = 'sub-final'
    fin.textContent = this.finalTail
    const int = document.createElement('span')
    int.className = 'sub-interim'
    int.textContent = this.interim ? ` ${this.interim}` : ''
    this.el.append(fin, int)
  }
}
