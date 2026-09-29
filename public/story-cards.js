export function storyCard(story) {
  const card = document.createElement('a');
  card.className = 'story-card';
  card.href = `/results/${story.id}`;
  if (story.title) {
    const title = document.createElement('h3');
    title.className = 'story-card-title';
    title.textContent = story.title;
    card.append(title);
  }
  const text = document.createElement('blockquote');
  text.className = 'story-card-text';
  text.textContent = story.story;
  card.append(text);
  return card;
}
