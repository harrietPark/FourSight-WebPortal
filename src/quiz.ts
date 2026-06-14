function filterMythsForObject(myths: string[], objectName: string) {
  const isDrinkware = /cup|mug|coffee|soda|bottle/i.test(objectName);

  return myths.filter((myth) => {
    const lower = myth.toLowerCase();
    const isDrinkMyth = /paper cup|coffee cup|takeaway cup|mug|soda cup|straw/i.test(lower);
    return isDrinkware || !isDrinkMyth;
  });
}

export function isQuizNatural(question: string, objectName: string) {
  const lower = question.toLowerCase();
  const objectLower = objectName.toLowerCase();
  const isDrinkware = /cup|mug|coffee|soda|bottle/i.test(objectLower);
  const hasWrongDrinkRef = /paper cup|coffee cup|takeaway cup|soda cup/i.test(lower);

  if (!isDrinkware && hasWrongDrinkRef) {
    return false;
  }

  if (/for this .+, a paper cup/i.test(lower)) {
    return false;
  }

  if (/true or false: for this/i.test(lower)) {
    return false;
  }

  return true;
}

export function makeQuiz(myths: string[], objectName: string, materialName: string) {
  const objectLower = objectName.toLowerCase();
  const relevantMyths = filterMythsForObject(myths, objectName);
  const explanation =
    relevantMyths[0] ??
    `${objectName} combines ${materialName} with other parts, which changes how it should be recycled.`;

  if (/monitor|laptop|macbook|computer|mouse|keyboard|tablet|phone|electronics/i.test(objectLower)) {
    return {
      question: `Can you put an old ${objectName} in curbside recycling with cardboard and plastic?`,
      answer: false,
      explanation,
    };
  }

  if (/cup|mug|coffee|soda|bottle/i.test(objectLower)) {
    return {
      question: `Can a used ${objectName} usually go straight into a paper recycling bin?`,
      answer: false,
      explanation,
    };
  }

  return {
    question: `Is a ${objectName} as easy to recycle as plain ${materialName} packaging?`,
    answer: false,
    explanation,
  };
}

export function normalizeQuiz(
  generated: {
    quiz_question: string;
    quiz_answer: boolean;
    quiz_explanation?: string | null;
  } | null,
  myths: string[],
  objectName: string,
  materialName: string,
) {
  if (generated && isQuizNatural(generated.quiz_question, objectName)) {
    return {
      question: generated.quiz_question.trim().endsWith('?')
        ? generated.quiz_question.trim()
        : `${generated.quiz_question.trim()}?`,
      answer: generated.quiz_answer,
      explanation: generated.quiz_explanation ?? makeQuiz(myths, objectName, materialName).explanation,
    };
  }

  return makeQuiz(myths, objectName, materialName);
}
