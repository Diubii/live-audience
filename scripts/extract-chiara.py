#!/usr/bin/env python3
"""Prepara le attività delle slide di Chiara senza modificare il database.

Le opzioni fotografiche diventano i nomi degli attori, come richiesto. Gli elementi
visibili soltanto alla soluzione (sticker, emoji e commenti) non sono opzioni.
"""
import argparse
import json
import re
from html.parser import HTMLParser
from pathlib import Path


class Node:
    def __init__(self, tag="", attrs=(), parent=None):
        self.tag = tag
        self.attrs = dict(attrs)
        self.children = []
        self.parent = parent

    def descendants(self):
        for child in self.children:
            if isinstance(child, Node):
                yield child
                yield from child.descendants()

    def find(self, predicate):
        return next((node for node in self.descendants() if predicate(node)), None)

    def has_class(self, name):
        return name in self.attrs.get("class", "").split()

    def text(self):
        if self.tag in ("small", "template") or self.has_class("no-bubbles"):
            return ""
        return " ".join(child.text() if isinstance(child, Node) else child for child in self.children)


class Parser(HTMLParser):
    VOID = {"img", "br", "meta", "link", "input", "source", "hr", "area", "base", "embed", "wbr"}

    def __init__(self):
        super().__init__()
        self.root = Node()
        self.current = self.root

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs, self.current)
        self.current.children.append(node)
        if tag not in self.VOID:
            self.current = node

    def handle_endtag(self, tag):
        node = self.current
        while node.parent:
            if node.tag == tag:
                self.current = node.parent
                return
            node = node.parent

    def handle_data(self, data):
        self.current.children.append(data)


def text(node):
    if node is None:
        raise ValueError("Testo richiesto non trovato nel sorgente")
    return re.sub(r"\s+", " ", node.text()).strip()


def extract(source):
    parser = Parser()
    parser.feed(source)
    activities = []
    double_points = False
    for slide in parser.root.descendants():
        if slide.tag != "section":
            continue
        slide_id = slide.attrs.get("id", "")
        if slide_id == "domande-doppi-punti":
            double_points = True
        if not any(slide.has_class(name) for name in ("timed-question", "choice-question", "photo-question")):
            continue
        question = text(slide.find(lambda node: node.tag == "h1"))
        config = {"question": question, "scoring": "points"}
        options = [node for node in slide.descendants() if node.has_class("quiz-option")]
        if options:
            labels = []
            for option in options:
                label = text(option)
                if not label:
                    image = option.find(lambda node: node.tag == "img")
                    if image is None or not image.attrs.get("alt"):
                        raise ValueError(f"{slide_id}: opzione fotografica senza nome")
                    label = image.attrs["alt"]
                labels.append(label)
            accepted = [label for option, label in zip(options, labels) if option.attrs.get("data-correct") == "true"]
            if len(accepted) != 1:
                raise ValueError(f"{slide_id}: serve una sola risposta corretta")
            config.update(answerMode="choice", choices=labels, acceptedAnswers=accepted)
        else:
            if slide_id == "nomi-genitori":
                answer_slide = parser.root.find(lambda node: node.attrs.get("id") == "risposta-genitori")
                answer = text(answer_slide.find(lambda node: "data-answer-result" in node.attrs)).rstrip("!")
                names = answer.split(" e ")
                if len(names) != 2:
                    raise ValueError("Soluzione genitori non riconosciuta: rivedere le varianti accettate")
                accepted = [answer, " e ".join(reversed(names)), " ".join(names), " ".join(reversed(names))]
            elif slide_id == "domanda-picasso":
                answer_slide = parser.root.find(lambda node: node.attrs.get("id") == "soluzione-picasso")
                accepted = [text(answer_slide.find(lambda node: node.has_class("route-answer"))).rstrip("!")]
            else:
                answer = slide.find(lambda node: "data-written-answer" in node.attrs or "data-photo-answer" in node.attrs)
                if answer is None:
                    raise ValueError(f"{slide_id}: soluzione non trovata; controllare gli aside")
                accepted = [answer.attrs.get("aria-label") or text(answer).rstrip("!")]
            config["acceptedAnswers"] = accepted
        if double_points:
            config["pointsMultiplier"] = 2
        notes = slide.find(lambda node: node.tag == "aside")
        activities.append({
            "slug": slide.attrs.get("data-live") or slide_id,
            "slideId": slide_id,
            "type": "memory-quiz",
            "title": question,
            "config": config,
            "notes": text(notes) if notes else "",
        })
    if not activities:
        raise ValueError("Nessuna domanda trovata nel sorgente")
    return {"presentation": {"slug": "compleanno-chiara", "title": "Compleanno di Chiara"}, "activities": activities}


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("source", type=Path)
    cli.add_argument("output", type=Path)
    args = cli.parse_args()
    manifest = extract(args.source.read_text())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    for item in manifest["activities"]:
        print(f"{item['slug']}: {len(item['config'].get('choices', []))} opzioni, punti ×{item['config'].get('pointsMultiplier', 1)}")


if __name__ == "__main__":
    main()
