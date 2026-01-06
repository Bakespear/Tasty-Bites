
        puter.ai.chat("What are the benefits of exercise?", { model: "gpt-4.1-nano" })
            .then(response => {
                puter.print(response);
            });
    