package io.github.gandalfthejunior.mtgcommanderstats.scryfall.domain;

/** Read-only display data from one face of the saved printing, independent of gameplay eligibility. */
public record CardFace(Integer faceIndex, String name, String typeLine, String oracleText, String imageUrl) {
}
