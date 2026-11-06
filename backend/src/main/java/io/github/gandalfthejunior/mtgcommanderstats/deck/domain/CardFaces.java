package io.github.gandalfthejunior.mtgcommanderstats.deck.domain;

import java.util.List;

import io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain.CardFace;

/** Value semantics for the complete display snapshot stored in an embedded deck slot. */
public record CardFaces(List<CardFace> faces) {
    public CardFaces {
        faces = List.copyOf(faces);
    }
}
