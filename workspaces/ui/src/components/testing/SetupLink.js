import React from 'react';

export default function (props) {
  const { href, children, ...otherProps } = props;

  return (
    <a
      href="https://calendly.com/opticlabs/optic-setup"
      target="_blank"
      {...otherProps}
    >
      {children}
    </a>
  );
}
